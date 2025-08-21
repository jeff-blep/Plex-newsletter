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

const PLATFORM_ICON: Record<string, string> = {
  "roku": "📺",
  "apple tv": "🍎",
  "appletv": "🍎",
  "android tv": "🤖",
  "android": "🤖",
  "ios": "📱",
  "iphone": "📱",
  "ipad": "📱",
  "web": "🖥️",
  "chrome": "🖥️",
  "chromecast": "📡",
  "lg": "🖥️",
  "samsung": "🖥️",
  "xbox": "🎮",
  "playstation": "🎮",
};
function iconForPlatform(name: string): string {
  const key = String(name || "").toLowerCase();
  for (const k of Object.keys(PLATFORM_ICON)) {
    if (key.includes(k)) return PLATFORM_ICON[k];
  }
  return "🧩";
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

  // NEW: Library totals (movies / series / episodes)
  const [libTotals, setLibTotals] = useState<{ movies: number; series: number; episodes: number }>({
    movies: 0, series: 0, episodes: 0,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    // Fetch the card summary (already wired server-side)
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

    // Fetch library counts directly from Tautulli
    (async () => {
      try {
        const t = await getTautulliLibrariesTable();
        // Shape: { data: [...] }
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
        // If this fails, silently keep zeros — the rest of the card still works
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

  return (
    // No inner card chrome — content only to live inside the outer (blue) card
    <div className="space-y-4">
      {/* top row: spinner on the right, no duplicate title */}
      <div className="flex items-center justify-end min-h-6">
        {loading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {err && (
        <div className="alert alert-error">
          <span>Failed to load data: {err}</span>
        </div>
      )}

      {/* NEW: Library totals strip */}
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

      {/* Summary strip (plays over the selected window) */}
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

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Most Watched Movies */}
        <section>
          <h3 className="font-medium mb-2">Most Watched Movies</h3>
          {rowsMovies.length === 0 ? (
            <div className="opacity-70 text-sm">No data</div>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {rowsMovies.map((r: any, i: number) => {
                const title = r?.title || "Untitled";
                const year = r?.year ? ` (${r.year})` : "";
                const plays = Number(r?.total_plays || r?.plays || 0);
                const u = thumbUrl(r);
                return (
                  <li key={i} className="flex items-center gap-3 rounded-lg p-2 hover:bg-base-200/60">
                    {u ? (
                      <img src={u} alt="" className="w-12 h-16 object-cover rounded-md flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-16 bg-base-300 rounded-md" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{title}{year}</div>
                      <div className="opacity-70 text-xs">{plays} plays</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Most Watched TV Shows */}
        <section>
          <h3 className="font-medium mb-2">Most Watched TV Shows</h3>
          {rowsShows.length === 0 ? (
            <div className="opacity-70 text-sm">No data</div>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {rowsShows.map((r: any, i: number) => {
                const title = r?.grandparent_title || r?.title || "TV Show";
                const plays = Number(r?.total_plays || r?.plays || 0);
                const u = thumbUrl(r);
                return (
                  <li key={i} className="flex items-center gap-3 rounded-lg p-2 hover:bg-base-200/60">
                    {u ? (
                      <img src={u} alt="" className="w-12 h-16 object-cover rounded-md flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-16 bg-base-300 rounded-md" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{title}</div>
                      <div className="opacity-70 text-xs">{plays} plays</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Most Used Platforms */}
        <section>
          <h3 className="font-medium mb-2">Most Used Platforms</h3>
          {rowsPlatforms.length === 0 ? (
            <div className="opacity-70 text-sm">No data</div>
          ) : (
            <ul className="grid grid-cols-1 gap-2">
              {rowsPlatforms.map((r: any, i: number) => {
                const name = r?.platform || r?.label || r?.client || "Platform";
                const plays = Number(r?.total_plays || r?.plays || 0);
                return (
                  <li key={i} className="flex items-center justify-between rounded-lg p-2 hover:bg-base-200/60">
                    <span className="truncate flex items-center gap-2">
                      <span>{iconForPlatform(name)}</span>
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="opacity-70 text-xs ml-2">{plays} plays</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="opacity-60 text-xs">
        Totals are read directly from Tautulli across the selected window. Library counts are from Tautulli’s library table.
      </div>
    </div>
  );
}
