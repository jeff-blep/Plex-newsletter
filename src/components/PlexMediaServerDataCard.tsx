// src/components/PlexMediaServerDataCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { getTautulliLibrariesTable } from "../api";

type HomeRow = Record<string, any>;
type HomeBlock = { stat_id?: string; stat_title?: string; rows?: HomeRow[] };
type Summary = {
  home?: HomeBlock[];
  totals?: {
    movies?: number;
    episodes?: number;
    total_plays?: number;
    total_time_seconds?: number;
  };
};

function pickHomeRows(home: HomeBlock[] | undefined, ids: string[]): HomeRow[] {
  const blocks = Array.isArray(home) ? home : [];
  for (const b of blocks) {
    if (ids.includes(String(b?.stat_id || ""))) {
      return Array.isArray(b?.rows) ? b.rows : [];
    }
  }
  return [];
}

function hhmm(secs?: number): string {
  const s = Math.max(0, Number(secs || 0) | 0);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return `${h} Hours ${m} Minutes`;
}

function fmt(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

function splitTwo<T>(arr: T[]) {
  const mid = Math.ceil(arr.length / 2);
  return { left: arr.slice(0, mid), right: arr.slice(mid) };
}

/* ================= Platform Icon Mapping (your filenames) =================
   Expected files under /public/platforms:
   atv.png, roku.png, android.png, ios.png, samsung.png, chrome.png, safari.png,
   lg.png, playstation.png, chromecast.png, macos.png, xbox.png, generic.png
*/
const PLATFORM_FILE_MAP: Record<string, string> = {
  appletv: "atv.png",          // Apple TV / tvOS
  roku: "roku.png",
  androidtv: "android.png",    // if you have a separate androidtv.png, change this
  android: "android.png",
  ios: "ios.png",
  samsung: "samsung.png",      // Samsung TV / Tizen
  chrome: "chrome.png",
  safari: "safari.png",
  lg: "lg.png",                // LG webOS
  playstation: "playstation.png",
  chromecast: "chromecast.png",
  macos: "macos.png",
  xbox: "xbox.png",
};

/** Friendly labels for normalized platform keys */
const PLATFORM_LABEL_MAP: Record<string, string> = {
  appletv: "Apple TV",
  samsung: "Samsung TV",
  lg: "LG TV",
  androidtv: "Android TV",
  android: "Android",
  ios: "iOS",
  chrome: "Chrome",
  safari: "Safari",
  roku: "Roku",
  chromecast: "Chromecast",
  playstation: "PlayStation",
  xbox: "Xbox",
  macos: "macOS",
};

const PLATFORM_EMOJI: Record<string, string> = {
  appletv: "🍎",
  roku: "📺",
  androidtv: "🤖",
  android: "🤖",
  ios: "📱",
  chrome: "🖥️",
  safari: "🖥️",
  lg: "🖥️",
  samsung: "🖥️",
  chromecast: "📡",
  xbox: "🎮",
  playstation: "🎮",
  macos: "💻",
};

function emojiForKey(key: string): string {
  return PLATFORM_EMOJI[key] || "🧩";
}

/** Normalize Tautulli labels to our keys above. */
function normalizePlatform(name: string): string {
  const raw = String(name || "").toLowerCase().trim();

  // Apple TV
  if (raw.includes("apple tv") || raw.includes("tvos") || raw.includes("appletv")) return "appletv";

  // Samsung TV / Tizen
  if (raw.includes("samsung tv") || raw.includes("tizen") || raw === "samsung") return "samsung";

  // LG / webOS
  if (raw.includes("webos") || raw.includes("lg")) return "lg";

  // Browsers / Plex Web
  if (raw.includes("plex web") || raw.includes("chrome")) return "chrome";
  if (raw.includes("safari")) return "safari";

  // Android TV vs Android (Plex App (Android))
  if (raw.includes("android tv")) return "androidtv";
  if (raw.includes("plex app (android)") || raw === "android" || raw.includes("android")) return "android";

  // iOS family (Plex App (iOS), iPhone/iPad/iOS)
  if (raw.includes("plex app (ios)") || raw.includes("iphone") || raw.includes("ipad") || raw.includes("ios")) return "ios";

  // Chromecast / Roku
  if (raw.includes("chromecast")) return "chromecast";
  if (raw.includes("roku")) return "roku";

  // Consoles
  if (raw.includes("xbox")) return "xbox";
  if (raw.includes("playstation") || raw.includes("ps4") || raw.includes("ps5")) return "playstation";

  // macOS desktop app
  if (raw.includes("macos") || raw.includes("plex app (macos)")) return "macos";

  // Fallback: stable key (may map to generic)
  return raw.replace(/[\s_]+/g, "").replace(/[^a-z0-9-]/g, "");
}

/** Poster-sized platform icon with PNG-first, emoji fallback */
function PlatformIcon({
  name,
  className = "",
  size = "poster",
}: {
  name: string;
  className?: string;
  size?: "poster" | "sm";
}) {
  const [failed, setFailed] = useState(false);
  const key = normalizePlatform(name);
  const file = PLATFORM_FILE_MAP[key];

  const baseClasses =
    size === "poster"
      ? "w-14 h-14 object-cover rounded-md"
      : "w-5 h-5 object-contain";

  // Try PNG in /public/platforms
  if (!failed && file) {
    return (
      <img
        src={`/platforms/${file}`}
        alt={name || "platform"}
        className={`${baseClasses} ${className}`}
        onError={() => setFailed(true)}
        loading="lazy"
      />
    );
  }

  // Emoji fallback if PNG missing
  if (size === "poster") {
    return (
      <div
        className={`${baseClasses} ${className} grid place-items-center bg-base-300/60`}
        aria-label={name}
        title={name}
      >
        <span className="text-lg">{emojiForKey(key)}</span>
      </div>
    );
  }
  return <span className={className} title={name}>{emojiForKey(key)}</span>;
}

function thumbUrl(row: any): string | null {
  const p = row?.thumb || row?.grandparent_thumb || row?.grandparentThumb || row?.art;
  if (!p) return null;
  return `/api/plex/image?path=${encodeURIComponent(p)}`;
}

export default function PlexMediaServerDataCard({ days = 7 }: { days?: number }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [libTotals, setLibTotals] = useState<{ movies: number; series: number; episodes: number }>({
    movies: 0, series: 0, episodes: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    // Summary for selected window
    fetch(`/api/tautulli/summary?days=${encodeURIComponent(days)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: Summary) => {
        if (!cancelled) setSummary(j);
      })
      .catch(e => !cancelled && setErr(e?.message || String(e)))
      .finally(() => !cancelled && setLoading(false));

    // Library counts
    (async () => {
      try {
        const t = await getTautulliLibrariesTable();
        const rows: any[] = Array.isArray((t as any)?.data) ? (t as any).data : [];
        let movies = 0, series = 0, episodes = 0;
        for (const row of rows) {
          const type = String(row?.section_type || "").toLowerCase();
          if (type === "movie") {
            movies += Number(row?.count ?? 0) | 0;
          } else if (type === "show") {
            series += Number(row?.count ?? 0) | 0;
            const ep = (row?.grandchild_count ?? row?.child_count ?? 0);
            episodes += Number(ep) | 0;
          }
        }
        if (!cancelled) setLibTotals({ movies, series, episodes });
      } catch (e) {
        console.warn("[PlexMediaServerDataCard] get_libraries_table failed:", e);
      }
    })();

    return () => { cancelled = true; };
  }, [days]);

  const rowsMovies = useMemo(
    () => pickHomeRows(summary?.home, ["top_movies", "most_watched_movies"]).slice(0, 6),
    [summary]
  );
  const rowsShows = useMemo(
    () => pickHomeRows(summary?.home, ["top_tv", "most_watched_tv_shows", "most_watched_tv"]).slice(0, 6),
    [summary]
  );
  const rowsPlatforms = useMemo(
    () => pickHomeRows(summary?.home, ["top_platforms", "most_used_platforms", "top_clients"]).slice(0, 6),
    [summary]
  );

  const moviesCols = useMemo(() => splitTwo(rowsMovies), [rowsMovies]);
  const showsCols = useMemo(() => splitTwo(rowsShows), [rowsShows]);
  const platsCols = useMemo(() => splitTwo(rowsPlatforms), [rowsPlatforms]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end min-h-6">
        {loading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {err && (
        <div className="alert alert-error">
          <span>Failed to load data: {err}</span>
        </div>
      )}

      {/* Library totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl px-4 py-3 bg-base-200/50">
          <div className="text-sm opacity-70 flex items-center gap-2"><span>🎞️</span> Movies (Library)</div>
          <div className="text-2xl font-semibold">{fmt(libTotals.movies)}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-base-200/50">
          <div className="text-sm opacity-70 flex items-center gap-2"><span>📚</span> TV Series (Library)</div>
          <div className="text-2xl font-semibold">{fmt(libTotals.series)}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-base-200/50">
          <div className="text-sm opacity-70 flex items-center gap-2"><span>📺</span> TV Episodes (Library)</div>
          <div className="text-2xl font-semibold">{fmt(libTotals.episodes)}</div>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl px-4 py-3 bg-base-200/50">
          <div className="text-sm opacity-70 flex items-center gap-2"><span>🎬</span> Movies Streamed</div>
          <div className="text-2xl font-semibold">{fmt(summary?.totals?.movies)}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-base-200/50">
          <div className="text-sm opacity-70 flex items-center gap-2"><span>📺</span> TV Episodes Streamed</div>
          <div className="text-2xl font-semibold">{fmt(summary?.totals?.episodes)}</div>
        </div>
        <div className="rounded-xl px-4 py-3 bg-base-200/50">
          <div className="text-sm opacity-70 flex items-center gap-2"><span>⏱️</span> Total Hours Streamed</div>
          <div className="text-2xl font-semibold">{hhmm(summary?.totals?.total_time_seconds)}</div>
        </div>
      </div>

      {/* Most Watched Movies */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h3 className="card-title text-base">Most Watched Movies</h3>
          {rowsMovies.length === 0 ? (
            <div className="opacity-70 text-sm">No data</div>
          ) : (
            <TwoColList
              left={moviesCols.left}
              right={moviesCols.right}
              render={(r: any, idx: number) => {
                const title = r?.title || "Untitled";
                const year = r?.year ? ` (${r.year})` : "";
                const plays = Number(r?.total_plays || r?.plays || 0);
                const u = thumbUrl(r);
                return (
                  <li className="card card-compact bg-base-200/60">
                    <div className="p-2 flex items-center gap-3">
                      <span className="w-6 text-xs opacity-70">{idx}.</span>
                      {u ? (
                        <img src={u} alt="" className="w-12 h-16 object-cover rounded-md flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-16 bg-base-300 rounded-md" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{title}{year}</div>
                        <div className="opacity-70 text-xs">{fmt(plays)} plays</div>
                      </div>
                    </div>
                  </li>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Most Watched TV Shows */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h3 className="card-title text-base">Most Watched TV Shows</h3>
          {rowsShows.length === 0 ? (
            <div className="opacity-70 text-sm">No data</div>
          ) : (
            <TwoColList
              left={showsCols.left}
              right={showsCols.right}
              render={(r: any, idx: number) => {
                const title = r?.grandparent_title || r?.title || "TV Show";
                const plays = Number(r?.total_plays || r?.plays || 0);
                const u = thumbUrl(r);
                return (
                  <li className="card card-compact bg-base-200/60">
                    <div className="p-2 flex items-center gap-3">
                      <span className="w-6 text-xs opacity-70">{idx}.</span>
                      {u ? (
                        <img src={u} alt="" className="w-12 h-16 object-cover rounded-md flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-16 bg-base-300 rounded-md" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{title}</div>
                        <div className="opacity-70 text-xs">{fmt(plays)} plays</div>
                      </div>
                    </div>
                  </li>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Most Used Platforms */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h3 className="card-title text-base">Most Used Platforms</h3>
          {rowsPlatforms.length === 0 ? (
            <div className="opacity-70 text-sm">No data</div>
          ) : (
            <TwoColList
              left={platsCols.left}
              right={platsCols.right}
              render={(r: any, idx: number) => {
                const rawName = r?.platform || r?.label || r?.client || "Platform";
                const plays = Number(r?.total_plays || r?.plays || 0);
                const key = normalizePlatform(rawName);
                const friendly = PLATFORM_LABEL_MAP[key] || rawName;
                return (
                  <li className="card card-compact bg-base-200/60">
                    <div className="p-2 flex items-center justify-between gap-3">
                      <span className="truncate flex items-center gap-3">
                        <span className="w-6 text-xs opacity-70">{idx}.</span>
                        <PlatformIcon name={rawName} size="poster" />
                        <span className="truncate">{friendly}</span>
                      </span>
                      <span className="opacity-70 text-xs ml-2">{fmt(plays)} plays</span>
                    </div>
                  </li>
                );
              }}
            />
          )}
        </div>
      </div>

      <div className="opacity-60 text-xs">
        Totals are read directly from Tautulli across the selected window. Library counts are from Tautulli’s library table.
      </div>
    </div>
  );
}

/** Utility to render two equal columns of small cards with running index */
function TwoColList({
  left,
  right,
  render,
}: {
  left: any[];
  right: any[];
  render: (row: any, idx: number) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ul className="space-y-2">
        {left.map((r, i) => (
          <React.Fragment key={`left-${i}`}>{render(r, i + 1)}</React.Fragment>
        ))}
      </ul>
      <ul className="space-y-2">
        {right.map((r, i) => (
          <React.Fragment key={`right-${i}`}>{render(r, left.length + i + 1)}</React.Fragment>
        ))}
      </ul>
    </div>
  );
}
