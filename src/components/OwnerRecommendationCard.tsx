import React from "react";

/** --- Small helpers --- */
function apiBase() {
  return "http://localhost:5174";
}
function plexImgFromPath(path?: string) {
  if (!path) return undefined;
  // path typically like: /library/metadata/12345/thumb/1699999999
  return `${apiBase()}/plex/image?path=${encodeURIComponent(
    path.startsWith("/") ? path : `/${path}`
  )}`;
}

type SearchType = "movie" | "show";
type SearchItem = {
  ratingKey: string | number;
  title: string;
  year?: number;
  thumb?: string;      // path form (preferred)
  type?: "movie" | "show" | "episode" | string;
};

type OwnerRecommendationConfig = {
  enabled?: boolean;
  type?: SearchType;
  plexItemId?: string | number;
  note?: string;
};

type Props = {
  /** Provide the full config object */
  config: any;
  /** Persist partial config to backend */
  save: (partial: any) => Promise<void>;
};

export default function OwnerRecommendationCard({ config, save }: Props) {
  // initialize from config
  const initial: OwnerRecommendationConfig = config?.ownerRecommendation ?? {};
  const [enabled, setEnabled] = React.useState<boolean>(!!initial.enabled);
  const [type, setType] = React.useState<SearchType>((initial.type as SearchType) || "movie");
  const [note, setNote] = React.useState<string>(initial.note ?? "");
  const [selected, setSelected] = React.useState<SearchItem | null>(null);

  // live search
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<SearchItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  // if we have an existing plexItemId, try to hydrate it (once)
  React.useEffect(() => {
    const rk = initial.plexItemId;
    if (!rk) return;
    let isCancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/plex/item/${encodeURIComponent(String(rk))}`);
        const json = await res.json();
        if (!isCancelled && json?.ok && json?.item) {
          const it = json.item;
          setSelected({
            ratingKey: it.ratingKey ?? it.rating_key ?? rk,
            title: it.title || "Selected Item",
            year: it.year ? Number(it.year) : undefined,
            thumb: it.thumb ?? it.grandparentThumb ?? it.art ?? undefined,
            type: it.type,
          });
          // also normalize type if present
          if (it.type === "show" || it.type === "movie") {
            setType(it.type);
          }
        }
      } catch {
        // ignore hydrate errors
      }
    })();
    return () => { isCancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced search (live suggestions after 2+ chars)
  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        setError(null);
        setDropdownOpen(true);
        const url = `${apiBase()}/plex/search?q=${encodeURIComponent(q.trim())}&type=${encodeURIComponent(
          type
        )}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!cancelled) {
          if (json?.ok && Array.isArray(json?.results)) {
            const rows: SearchItem[] = json.results.map((r: any) => ({
              ratingKey: r.ratingKey ?? r.rating_key ?? r.id,
              title: r.title || r.grandparentTitle || "Untitled",
              year: r.year ? Number(r.year) : undefined,
              thumb: r.thumb ?? r.grandparentThumb ?? undefined,
              type: r.type,
            }));
            setResults(rows.slice(0, 10)); // keep it tight
          } else {
            setResults([]);
            setError(json?.error ? String(json.error) : "No results.");
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setResults([]);
          setError(e?.message || String(e));
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, type]);

  async function persist(newState: Partial<OwnerRecommendationConfig>) {
    const payload = {
      ownerRecommendation: {
        enabled,
        type,
        note,
        plexItemId: selected?.ratingKey ?? null,
        ...newState,
      },
    };
    await save(payload);
  }

  function onToggleEnabled(v: boolean) {
    setEnabled(v);
    void persist({ enabled: v });
  }

  function onChooseType(v: SearchType) {
    setType(v);
    // clear selection if type changes (to avoid mismatches)
    setSelected(null);
    setQ("");
    setResults([]);
    setDropdownOpen(false);
    void persist({ type: v, plexItemId: null });
  }

  function onPick(item: SearchItem) {
    setSelected(item);
    setQ("");
    setResults([]);
    setDropdownOpen(false);
    void persist({ plexItemId: item.ratingKey });
  }

  async function onSaveNote() {
    await persist({ note });
  }

  function SelectedTile() {
    if (!selected) return (
      <div className="opacity-60 text-sm">No title chosen yet.</div>
    );
    const img = plexImgFromPath(selected.thumb);
    return (
      <div className="flex gap-3 items-start">
        <div className="w-24">
          {img ? (
            <img
              src={img}
              alt=""
              className="w-24 h-36 object-cover rounded"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-24 h-36 bg-base-200 rounded" />
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {selected.title} {selected.year ? <span className="opacity-70">({selected.year})</span> : null}
          </div>
          <div className="text-xs opacity-70 break-all">ratingKey: {String(selected.ratingKey)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Owner Recommendation</h2>
          <label className="flex items-center gap-3">
            <span className="text-sm">Enabled</span>
            <input
              type="checkbox"
              className="toggle"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="join">
            <button
              className={`btn join-item ${type === "movie" ? "btn-primary" : ""}`}
              onClick={() => onChooseType("movie")}
            >
              Movies
            </button>
            <button
              className={`btn join-item ${type === "show" ? "btn-primary" : ""}`}
              onClick={() => onChooseType("show")}
            >
              TV Shows
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              className="input input-bordered w-80"
              placeholder={`Search ${type === "movie" ? "movies" : "shows"}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => q.length >= 2 && setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            />
            {dropdownOpen && (results.length > 0 || searching || error) && (
              <div className="absolute z-20 mt-1 w-full rounded-md border border-base-300 bg-base-100 shadow">
                {searching ? (
                  <div className="p-3 text-sm opacity-70">Searching…</div>
                ) : results.length > 0 ? (
                  <ul className="menu menu-sm">
                    {results.map((r, i) => (
                      <li key={`${r.ratingKey}-${i}`}>
                        <button
                          className="justify-start"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => onPick(r)}
                          title={r.title}
                        >
                          <span className="truncate">
                            {r.title} {r.year ? <span className="opacity-70">({r.year})</span> : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-3 text-sm opacity-70">{error || "No matches."}</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-4">
          {/* Left: Selected poster+title */}
          <div>
            <SelectedTile />
          </div>

          {/* Right: comment box */}
          <div className="flex flex-col gap-2">
            <label className="label">
              <span className="label-text">Owner note (shown in newsletter)</span>
            </label>
            <textarea
              className="textarea textarea-bordered min-h-24"
              placeholder="Tell your guests why you recommend this one…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={onSaveNote} disabled={!enabled}>
                Save Recommendation
              </button>
              {selected && (
                <a
                  className="btn btn-ghost"
                  href={buildPlexDeepLink(selected.ratingKey)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Plex
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="text-xs opacity-60">
          Tip: start typing at least 2 letters to see live suggestions. Thumbnails are hidden in the dropdown on purpose—once picked, the poster appears on the left.
        </div>
      </div>
    </div>
  );
}

/** Deep link helper — uses Plex Web if available via localStorage (set by your Settings page), else no-op */
function buildPlexDeepLink(ratingKey: string | number | undefined) {
  if (!ratingKey) return "#";
  try {
    const webBase =
      localStorage.getItem("plex.webBase") ||
      localStorage.getItem("plexWebBaseUrl") ||
      "";
    const serverId =
      localStorage.getItem("plex.machineIdentifier") ||
      localStorage.getItem("plexServerId") ||
      "";
    if (webBase && serverId) {
      return `${webBase.replace(
        /\/$/,
        ""
      )}/web/index.html#!/server/${serverId}/details?key=%2Flibrary%2Fmetadata%2F${encodeURIComponent(
        String(ratingKey)
      )}`;
    }
  } catch {}
  return "#";
}
