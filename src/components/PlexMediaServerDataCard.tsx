// src/components/PlexMediaServerDataCard.tsx
import React, { useEffect, useMemo, useState } from "react";

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

export default function PlexMediaServerDataCard({ days }: { days: number }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
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
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Plex Media Server Data (Last {days} days)</h2>
          {loading ? <span className="loading loading-spinner loading-sm" /> : null}
        </div>

        {err && (
          <div className="alert alert-error my-2">
            <span>Failed to load data: {err}</span>
          </div>
        )}

        {/* Streaming Data strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="stat bg-base-200 rounded-xl p-4">
            <div className="stat-title flex items-center gap-2"><span>🎬</span> Movies Streamed</div>
            <div className="stat-value text-2xl">{summary?.totals?.movies ?? "—"}</div>
          </div>
          <div className="stat bg-base-200 rounded-xl p-4">
            <div className="stat-title flex items-center gap-2"><span>📺</span> TV Episodes Streamed</div>
            <div className="stat-value text-2xl">{summary?.totals?.episodes ?? "—"}</div>
          </div>
          <div className="stat bg-base-200 rounded-xl p-4">
            <div className="stat-title flex items-center gap-2"><span>⏱️</span> Total Hours Streamed</div>
            <div className="stat-value text-2xl">{hhmm(summary?.totals?.total_time_seconds)}</div>
          </div>
        </div>

        {/* Short, wide lists with thumbnails */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Most Watched Movies */}
          <div className="border border-base-300 rounded-xl p-3">
            <div className="font-semibold mb-2">Most Watched Movies</div>
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
                    <li key={i} className="flex items-center gap-3">
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
          </div>

          {/* Most Watched TV Shows */}
          <div className="border border-base-300 rounded-xl p-3">
            <div className="font-semibold mb-2">Most Watched TV Shows</div>
            {rowsShows.length === 0 ? (
              <div className="opacity-70 text-sm">No data</div>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {rowsShows.map((r: any, i: number) => {
                  const title = r?.grandparent_title || r?.title || "TV Show";
                  const plays = Number(r?.total_plays || r?.plays || 0);
                  const u = thumbUrl(r);
                  return (
                    <li key={i} className="flex items-center gap-3">
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
          </div>

          {/* Most Used Platforms */}
          <div className="border border-base-300 rounded-xl p-3">
            <div className="font-semibold mb-2">Most Used Platforms</div>
            {rowsPlatforms.length === 0 ? (
              <div className="opacity-70 text-sm">No data</div>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {rowsPlatforms.map((r: any, i: number) => {
                  const name = r?.platform || r?.label || r?.client || "Platform";
                  const plays = Number(r?.total_plays || r?.plays || 0);
                  return (
                    <li key={i} className="flex items-center justify-between">
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
          </div>
        </div>

        <div className="opacity-60 text-xs mt-3">
          Totals are read directly from Tautulli across the selected window.
        </div>
      </div>
    </div>
  );
}
