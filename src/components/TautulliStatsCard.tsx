import * as React from "react";

type CardItem = { name: string; value: number; thumb?: string; art?: string; href?: string };

const API = "http://localhost:5174";

/* --------- Plex deep-link + image helpers (reads from localStorage) ---------- */
function getPlexConfig() {
  try {
    const base = localStorage.getItem("plex.url") || localStorage.getItem("plexBaseUrl") || "";
    const webBase =
      localStorage.getItem("plex.webBase") ||
      localStorage.getItem("plexWebBaseUrl") ||
      "";
    const token = localStorage.getItem("plex.token") || localStorage.getItem("plexToken") || "";
    const serverId =
      localStorage.getItem("plex.machineIdentifier") ||
      localStorage.getItem("plexServerId") ||
      "";
    return { base, webBase, token, serverId };
  } catch {
    return { base: "", webBase: "", token: "", serverId: "" };
  }
}

function plexImg(path?: string) {
  const { base, token } = getPlexConfig();
  if (!base || !path) return undefined;
  const sep = path.includes("?") ? "&" : "?";
  const full = `${base}${path}${token ? `${sep}X-Plex-Token=${encodeURIComponent(token)}` : ""}`;
  return `${API}/plex/image?u=${encodeURIComponent(full)}`;
}

function plexHrefFromRow(r: any) {
  const { base, webBase, serverId, token } = getPlexConfig();
  const ratingKey = r?.rating_key || r?.ratingKey || r?.id;
  if (!ratingKey) return undefined;

  if (webBase && serverId) {
    return `${webBase.replace(/\/$/, "")}/web/index.html#!/server/${serverId}/details?key=%2Flibrary%2Fmetadata%2F${encodeURIComponent(
      ratingKey
    )}`;
  }
  const srv = base?.replace(/\/$/, "");
  if (!srv) return undefined;
  return `${srv}/library/metadata/${ratingKey}${
    token ? `?X-Plex-Token=${encodeURIComponent(token)}` : ""
  }`;
}

/* -------------------------------- utils -------------------------------- */
function pickHomeRows(json: any, ids: string[]) {
  const home = Array.isArray(json?.home) ? json.home : [];
  for (const b of home) {
    if (ids.includes(String(b?.stat_id || ""))) {
      return Array.isArray(b?.rows) ? b.rows : [];
    }
  }
  return [];
}

function dsTopMovies(json: any, limit = 5): CardItem[] {
  const rows = pickHomeRows(json, ["top_movies", "most_watched_movies"]);
  const arr = rows
    .filter((r: any) => String(r?.media_type || "").toLowerCase() === "movie")
    .map((r: any) => ({
      name: r?.title || "Untitled",
      value: Number(r?.total_plays || r?.plays || 0),
      thumb: plexImg(r?.thumb),
      art: plexImg(r?.art),
      href: plexHrefFromRow(r),
    }));
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, limit);
}

function dsTopShows(json: any, limit = 5): CardItem[] {
  const rows = pickHomeRows(json, ["top_tv", "most_watched_tv_shows", "most_watched_tv"]);
  const arr = rows.map((r: any) => ({
    name: r?.grandparent_title || r?.title || "TV Show",
    value: Number(r?.total_plays || r?.plays || 0),
    thumb: plexImg(r?.grandparent_thumb || r?.thumb),
    art: plexImg(r?.art),
    href: plexHrefFromRow(r),
  }));
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, limit);
}

function dsTopEpisodes(json: any, epRows: any[], limit = 5): CardItem[] {
  const rowsFromHome = pickHomeRows(json, ["top_episodes", "most_watched_episodes", "most_watched_tv"]);
  const rows = Array.isArray(epRows) && epRows.length ? epRows : rowsFromHome;

  const arr = (rows || [])
    .filter((r: any) => String(r?.media_type || "").toLowerCase() === "episode")
    .map((r: any) => {
      const show = r?.grandparent_title || "Show";
      const ep = r?.title || "";
      const name = ep ? `${show} — ${ep}` : show;
      return {
        name,
        value: Number(r?.total_plays || r?.plays || 0),
        thumb: plexImg(r?.grandparent_thumb || r?.thumb),
        art: plexImg(r?.art || r?.grandparent_thumb),
        href: plexHrefFromRow(r),
      };
    });
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, limit);
}

function dsTopPlatforms(json: any, limit = 5): CardItem[] {
  const rows = pickHomeRows(json, ["top_platforms", "most_used_platforms", "top_clients"]);
  const arr = rows.map((r: any) => ({
    name: r?.platform || r?.label || "Platform",
    value: Number(r?.total_plays || r?.plays || 0),
  }));
  arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, limit);
}

type Totals = { plays: number; hours: number };

/* ----------------------------- main component ----------------------------- */
export default function TautulliStatsCard({ days = 7 }: { days?: number }) {
  const [home, setHome] = React.useState<any | null>(null);
  const [episodes, setEpisodes] = React.useState<any[]>([]);
  const [bandwidth, setBandwidth] = React.useState<{ gb?: number; mb?: number; plays?: number } | null>(null);
  const [totals, setTotals] = React.useState<Totals>({ plays: 0, hours: 0 });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/tautulli/home?days=${encodeURIComponent(days)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        setHome(j);
        setTotals(computeTotals(j));
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e.message || e));
        setLoading(false);
      });
  }, [days]);

  React.useEffect(() => {
    fetch(`${API}/tautulli/episodes?days=${encodeURIComponent(days)}`)
      .then((r) => r.json())
      .then((j) => (j?.ok && Array.isArray(j?.rows) ? setEpisodes(j.rows) : setEpisodes([])))
      .catch(() => setEpisodes([]));
  }, [days]);

  React.useEffect(() => {
    fetch(`${API}/tautulli/bandwidth?days=${encodeURIComponent(days)}&remoteOnly=0`)
      .then((r) => r.json())
      .then((j) => (j?.ok ? setBandwidth({ gb: j.gb, mb: j.mb, plays: j.plays }) : setBandwidth(null)))
      .catch(() => setBandwidth(null));
  }, [days]);

  return (
    <div className="card bg-base-200 shadow-md p-4 rounded-md">
      <h2 className="text-xl font-semibold mb-2">Tautulli Stats (Last {days} days)</h2>

      {loading && <div>Loading…</div>}
      {error && (
        <div className="alert alert-error text-sm">
          <div className="font-semibold mb-1">Fetch error</div>
          <div>{error}</div>
        </div>
      )}

      {home && !error && !loading && (
        <div className="space-y-2">
          <div>
            <span className="font-semibold">Total Plays:</span>{" "}
            {new Intl.NumberFormat().format(totals.plays)}
          </div>
          <div>
            <span className="font-semibold">Total Watch Time:</span>{" "}
            {new Intl.NumberFormat().format(totals.hours)} hours
          </div>
          <div>
            <span className="font-semibold">Total Data Streamed:</span>{" "}
            {bandwidth?.gb ? `${bandwidth.gb.toFixed(2)} GB` : "—"}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-4">
            <ListCard title="Most Watched Movies" items={dsTopMovies(home, 5)} />
            <ListCard title="Most Watched TV Shows" items={dsTopShows(home, 5)} />
            <ListCard title="Most Watched Episodes" items={dsTopEpisodes(home, episodes, 5)} />
            <ListCard title="Most Used Platforms" items={dsTopPlatforms(home, 5)} unit="plays" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ small pieces ------------------------------ */
function computeTotals(json: any): Totals {
  try {
    // plays from byDow (if present)
    const byDow = json?.charts?.byDow;
    const series = Array.isArray(byDow?.data) ? byDow.data : [];
    const plays = series.reduce((sum: number, d: any) => sum + Number(d?.plays || d?.count || 0), 0);

    // rough duration from home rows (prevent double count by using max per unique key)
    const home = Array.isArray(json?.home) ? json.home : [];
    const byKey = new Map<string, number>();
    for (const block of home) {
      const rows = Array.isArray(block?.rows) ? block.rows : [];
      for (const r of rows) {
        const key = String(r?.rating_key || r?.row_id || r?.guid || r?.title || Math.random());
        const dur = Number(r?.total_duration || 0);
        const prev = byKey.get(key) || 0;
        if (dur > prev) byKey.set(key, dur);
      }
    }
    const duration = Array.from(byKey.values()).reduce((a, b) => a + b, 0);
    const hours = Math.round((duration / 3600) * 10) / 10;
    return { plays, hours };
  } catch {
    return { plays: 0, hours: 0 };
  }
}

function PlatformIcon({ name }: { name: string }) {
  const n = (name || "").toLowerCase();
  const common = "w-8 h-12 rounded bg-base-200 flex items-center justify-center";
  const text = "fill-current";
  if (n.includes("tvos") || n.includes("apple tv") || n === "apple") {
    return (
      <div className={common}>
        <svg viewBox="0 0 24 24" className="w-6 h-6 opacity-80">
          <path className={text} d="M16 13c-1.1 0-2 .9-2 2 0 1.1.9 2 2 2 .6 0 1.2-.3 1.6-.7.4-.4.7-1 .7-1.6 0-1.1-.9-2-2-2Zm-5.2-2.7c.5-1 1.4-1.6 2.4-1.6.4 0 .8.1 1.1.2-.2.6-.5 1.2-.9 1.7-.6.8-1.3 1.2-1.9 1.2-.4 0-.7-.1-1-.3-.1-.4-.1-.8.3-1.2ZM12 5c-4 0-7 3-7 7v6c0 1.7 1.3 3 3 3h8c1.7 0 3-1.3 3-3v-6c0-4-3-7-7-7Z"/>
        </svg>
      </div>
    );
  }
  if (n.includes("android")) {
    return (
      <div className={common}>
        <svg viewBox="0 0 24 24" className="w-6 h-6 opacity-80">
          <path className={text} d="M17.6 8.1l1.3-2.2a.5.5 0 10-.9-.5l-1.4 2.4A7.6 7.6 0 0012 7c-1.6 0-3 .4-4.6.8L6 5.4a.5.5 0 10-.9.5l1.3 2.2A6.7 6.7 0 004 14v4a1 1 0 001 1h1a1 1 0 001-1v-3h1v3a1 1 0 001 1h6a1 1 0 001-1v-3h1v3a1 1 0 001 1h1a1 1 0 001-1v-4a6.7 6.7 0 00-2.4-5.9zM9 9.5a.75.75 0 110-1.5.75.75 0 010 1.5zm6 0a.75.75 0 110-1.5.75.75 0 010 1.5z"/>
        </svg>
      </div>
    );
  }
  if (n.includes("roku")) {
    return (
      <div className={common}>
        <svg viewBox="0 0 24 24" className="w-7 h-7 opacity-80">
          <rect x="3" y="6" width="18" height="12" rx="2" className={text}></rect>
          <rect x="6" y="9" width="6" height="2" fill="white" opacity="0.9"></rect>
          <rect x="6" y="12" width="8" height="2" fill="white" opacity="0.9"></rect>
        </svg>
      </div>
    );
  }
  if (n.includes("ios") || n.includes("iphone") || n.includes("ipad")) {
    return (
      <div className={common}>
        <svg viewBox="0 0 24 24" className="w-6 h-6 opacity-80">
          <path className={text} d="M16 2H8a3 3 0 00-3 3v14a3 3 0 003 3h8a3 3 0 003-3V5a3 3 0 00-3-3zm-4 18a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
        </svg>
      </div>
    );
  }
  if (n.includes("chrome")) {
    return (
      <div className={common}>
        <svg viewBox="0 0 24 24" className="w-6 h-6 opacity-80">
          <circle cx="12" cy="12" r="3.5" fill="white" opacity="0.9"></circle>
          <path className={text} d="M12 2a10 10 0 019.3 6H12a4 4 0 00-3.5 2L5 6.1A10 10 0 0112 2zm0 20a10 10 0 01-8.7-5L7.8 9.8A4 4 0 0012 14h9.3A10 10 0 0112 22z"/>
        </svg>
      </div>
    );
  }
  return <div className="w-8 h-12 bg-base-200 rounded" />;
}

function ListCard({ title, items, unit = "plays" }: { title: string; items: CardItem[]; unit?: string }) {
  const headerBg = items?.[0]?.art;
  return (
    <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden">
      <div
        className="px-3 py-2"
        style={
          headerBg
            ? {
                backgroundImage: `linear-gradient(to right, rgba(0,0,0,.5), rgba(0,0,0,.2)), url('${headerBg}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                color: "white",
              }
            : {}
        }
      >
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="p-3">
        {items && items.length > 0 ? (
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="opacity-60 w-5 text-right">{i + 1}</span>
                  {it.thumb ? (
                    <img
                      src={it.thumb}
                      alt=""
                      className="w-8 h-12 object-cover rounded"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <PlatformIcon name={it.name} />
                  )}
                  {it.href ? (
                    <a
                      href={it.href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:underline"
                      title={it.name}
                    >
                      {it.name}
                    </a>
                  ) : (
                    <span className="truncate" title={it.name}>
                      {it.name}
                    </span>
                  )}
                </div>
                <span className="badge badge-neutral whitespace-nowrap">
                  {it.value} {unit.toUpperCase()}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-xs opacity-60 h-full flex items-center justify-center">No data</div>
        )}
      </div>
    </div>
  );
}
