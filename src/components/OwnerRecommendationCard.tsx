import React from "react";

type Props = {
  config: any;
  save: (partial: any) => Promise<void> | void;
};

type SearchResult = {
  ratingKey: string | number;
  title?: string;
  year?: number;
  type?: string; // movie | show | episode | season | unknown
  showTitle?: string;
  episodeTitle?: string;
  seasonIndex?: number;
  episodeIndex?: number;
  thumb?: string;      // full URL
  thumbPath?: string;  // e.g. /library/metadata/.../thumb/...
  grandparentThumb?: string;
  parentThumb?: string;
  art?: string;
  deepLink?: string;
  href?: string;
};

function normNum(n: any): number | undefined {
  const x = Number(n);
  return Number.isFinite(x) ? x : undefined;
}

function pickThumbPath(it: any): string | undefined {
  // Prefer the smallest poster-like asset
  return (
    it?.thumbPath ||
    it?.thumb ||
    it?.grandparentThumb ||
    it?.parentThumb ||
    it?.grandparent_thumb ||
    it?.parent_thumb ||
    it?.art ||
    it?.poster
  );
}

// Some Plex endpoints return { MediaContainer: { Metadata: [ ... ] } } or { Metadata: [ ... ] }
// Unwrap to a single item object when possible.
function unwrapPlexNode(raw: any): any {
  if (!raw) return raw;
  const mc = raw.MediaContainer ?? raw.mediacontainer;
  if (mc?.Metadata && Array.isArray(mc.Metadata) && mc.Metadata.length) return mc.Metadata[0];
  if (raw.Metadata && Array.isArray(raw.Metadata) && raw.Metadata.length) return raw.Metadata[0];
  return raw;
}

function normalizeItem(input: any): SearchResult {
  if (!input) return { ratingKey: "" };
  const raw = unwrapPlexNode(input);

  const ratingKey =
    raw.ratingKey ??
    raw.rating_key ??
    raw.id ??
    raw.key ??
    raw.guid ??
    "";

  const title =
    raw.title ??
    raw.name ??
    raw.grandparent_title ??
    raw.parent_title ??
    "";

  const year =
    normNum(raw.year) ??
    normNum(raw.originallyAvailableAt?.slice?.(0, 4)) ??
    undefined;

  // Try hard to determine type
  let type: string | undefined = (raw.type ?? raw.librarySectionType ?? raw.media_type) as any;
  if (!type) {
    // Heuristics
    if (raw.grandparent_title || raw.grandparentTitle) type = "episode";
  }

  const showTitle =
    raw.grandparent_title ??
    raw.grandparentTitle ??
    raw.seriesTitle ??
    raw.showTitle ??
    raw.parent_title ??
    raw.parentTitle ??
    raw.parent_name ??
    undefined;

  // Prefer the *episode* title when the object is an episode
  const episodeTitle = raw.type === "episode" ? (raw.title ?? raw.episodeTitle) : (raw.episodeTitle ?? undefined);

  const seasonIndex =
    normNum(raw.parentIndex) ??
    normNum(raw.parent_index) ??
    normNum(raw.season) ??
    normNum(raw.seasonIndex) ??
    undefined;

  const episodeIndex =
    normNum(raw.index) ??
    normNum(raw.episodeIndex) ??
    normNum(raw.episode) ??
    undefined;

  const thumbPath =
    raw.thumbPath ??
    raw.thumb ??
    raw.grandparentThumb ??
    raw.parentThumb ??
    raw.grandparent_thumb ??
    raw.parent_thumb ??
    raw.art ??
    undefined;

  const deepLink = raw.deepLink ?? raw.href ?? raw.url ?? undefined;
  const href = raw.href ?? raw.deepLink ?? raw.url ?? undefined;

  return {
    ratingKey,
    title,
    year,
    type,
    showTitle,
    episodeTitle,
    seasonIndex,
    episodeIndex,
    thumbPath,
    grandparentThumb: raw.grandparentThumb ?? raw.grandparent_thumb,
    parentThumb: raw.parentThumb ?? raw.parent_thumb,
    art: raw.art,
    deepLink,
    href,
  };
}

async function enrichEpisodes(base: SearchResult[]): Promise<SearchResult[]> {
  // If we can't confidently format an item (missing show/se/ep for an episode),
  // fetch canonical details for up to 12 candidates to enrich the label.
  const candidates = base
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => {
      const t = String(r.type || "").toLowerCase();
      const isEp = t === "episode" || (!!r.ratingKey && !t); // unclear type → try enrich
      const missingBits = !r.showTitle || r.seasonIndex == null || r.episodeIndex == null;
      return isEp && missingBits;
    })
    .slice(0, 12);

  if (candidates.length === 0) return base;

  const updates = await Promise.all(
    candidates.map(async ({ r, idx }) => {
      try {
        const resp = await fetch(`http://localhost:5174/plex/item/${encodeURIComponent(String(r.ratingKey))}`);
        if (!resp.ok) return null;
        const j = await resp.json();
        // server might return { ok, item } or raw Plex structures; normalize handles both
        const full = j?.item ? normalizeItem(j.item) : normalizeItem(j);
        return full ? { idx, full } : null;
      } catch {
        return null;
      }
    })
  );

  const out = base.slice();
  for (const u of updates) if (u && out[u.idx]) out[u.idx] = { ...out[u.idx], ...u.full };
  return out;
}

export default function OwnerRecommendationCard({ config, save }: Props) {
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [note, setNote] = React.useState<string>(config?.ownerRecommendation?.note || "");
  const [selectedId, setSelectedId] = React.useState<string | number | undefined>(
    config?.ownerRecommendation?.plexItemId || undefined
  );
  const [selectedItem, setSelectedItem] = React.useState<SearchResult | null>(null);

  // Load existing selected item details (if any)
  React.useEffect(() => {
    const id = config?.ownerRecommendation?.plexItemId;
    setSelectedId(id);
    const noteFromCfg = config?.ownerRecommendation?.note || "";
    setNote(noteFromCfg === "This is the shit!!" ? "" : noteFromCfg);
    if (!id) {
      setSelectedItem(null);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`http://localhost:5174/plex/item/${encodeURIComponent(String(id))}`);
        if (r.ok) {
          const j = await r.json();
          const item = j?.item ? normalizeItem(j.item) : normalizeItem(j);
          setSelectedItem(item);
        } else {
          setSelectedItem(null);
        }
      } catch {
        setSelectedItem(null);
      }
    })();
  }, [config?.ownerRecommendation?.plexItemId]);

  // Debounced search across ALL libraries
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`http://localhost:5174/plex/search?q=${encodeURIComponent(q)}`);
        if (r.ok) {
          const j = await r.json();
          const arr = Array.isArray(j?.results) ? j.results.map(normalizeItem) : [];
          const enriched = await enrichEpisodes(arr);
          setResults(enriched);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function chooseItem(it: SearchResult) {
    // Show something immediately
    const immediate = normalizeItem(it);
    setSelectedItem(immediate);

    const id = immediate.ratingKey;
    setSelectedId(id);
    await save({ ownerRecommendation: { plexItemId: id, note } });

    // Then fetch canonical item details to enrich thumb/title if needed
    try {
      const r = await fetch(`http://localhost:5174/plex/item/${encodeURIComponent(String(id))}`);
      if (r.ok) {
        const j = await r.json();
        const full = j?.item ? normalizeItem(j.item) : normalizeItem(j);
        if (full) setSelectedItem(full);
      }
    } catch {
      // ignore
    }
  }

  async function saveNote(next: string) {
    setNote(next);
    await save({ ownerRecommendation: { plexItemId: selectedId || "", note: next } });
  }

  function thumbUrl(it: SearchResult | null): string | undefined {
    if (!it) return undefined;
    const p = pickThumbPath(it);
    if (!p) return undefined;

    // If it's a relative Plex media path, use ?path= ; if it's an absolute URL, use ?u=
    if (typeof p === "string" && p.startsWith("/")) {
      return `http://localhost:5174/plex/image?path=${encodeURIComponent(p)}`;
    }
    return `http://localhost:5174/plex/image?u=${encodeURIComponent(p)}`;
  }

  function deepHref(it: SearchResult | null): string | undefined {
    return it?.deepLink || it?.href;
  }

  const posterSrc = thumbUrl(selectedItem);
  const titleText =
    selectedItem?.title
      ? `${selectedItem.title}${selectedItem.year ? ` (${selectedItem.year})` : ""}`
      : undefined;

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Owner Recommendation</h2>
          {/* No Enabled toggle; no Movie/TV toggle */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4">
          {/* Preview poster + title */}
          <div className="flex flex-col items-center">
            {posterSrc ? (
              <img
                src={posterSrc}
                alt=""
                className="w-24 h-36 object-cover rounded border border-base-300"
              />
            ) : (
              <div className="w-24 h-36 rounded bg-base-200 border border-base-300" />
            )}
            <div className="mt-2 text-center text-sm min-h-[1.25rem]">
              {selectedItem && titleText ? (
                deepHref(selectedItem) ? (
                  <a
                    href={deepHref(selectedItem)}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                    title={titleText}
                  >
                    {titleText}
                  </a>
                ) : (
                  <span title={titleText}>{titleText}</span>
                )
              ) : (
                <span className="opacity-60">No selection</span>
              )}
            </div>
          </div>

          {/* Search + note */}
          <div className="space-y-3">
            <label className="form-control">
              <div className="label">
                <span className="label-text">Search title (movies &amp; shows)</span>
              </div>
              <input
                type="text"
                className="input input-bordered"
                placeholder="Start typing to search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            {searching ? (
              <div className="text-sm opacity-70">Searching…</div>
            ) : results.length > 0 ? (
              <div className="border border-base-300 rounded">
                <ul className="menu bg-base-100 max-h-56 overflow-auto">
                  {results.map((r, i) => {
                    let label: string;
                    const t = String(r.type || "").toLowerCase();
                    if (t === "episode") {
                      const show = r.showTitle || undefined;
                      const epName = r.episodeTitle || r.title || "(untitled episode)";
                      const s = r.seasonIndex ? `Season ${r.seasonIndex}` : null;
                      const e = r.episodeIndex ? `Episode ${r.episodeIndex}` : null;
                      const se = s && e ? `${s}, ${e}` : s || e || "";
                      if (show) {
                        label = `${show} - ${epName}${se ? ` (${se})` : ""} • EPISODE`;
                      } else {
                        label = `${epName}${se ? ` (${se})` : ""} • EPISODE`;
                      }
                    } else {
                      label = `${r.title || "(untitled)"}${r.year ? ` (${r.year})` : ""} ${r.type ? `• ${String(r.type).toUpperCase()}` : ""}`;
                    }
                    return (
                      <li key={`${r.ratingKey}-${i}`}>
                        <button className="justify-start" onClick={() => chooseItem(r)} title={String(r.ratingKey)}>
                          <div className="flex items-center gap-2">
                            <span className="truncate">{label}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : query.trim().length >= 2 ? (
              <div className="text-sm opacity-70">No results.</div>
            ) : null}

            <label className="form-control">
              <div className="label">
                <span className="label-text">Owner note (optional)</span>
              </div>
              <textarea
                className="textarea textarea-bordered h-20"
                placeholder="Describe why you are recommending this"
                value={note}
                onChange={(e) => saveNote(e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
