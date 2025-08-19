// src/components/EmailTemplateCard.tsx
import React, { useEffect, useRef, useState } from "react";

type Props = {
  config: any;
  save: (partial: any) => Promise<void> | void;
};

const DEFAULT_TEMPLATE = ``;

const TEMPLATE_TOKENS: { key: string; label: string }[] = [
  { key: "{{CARD_MOST_WATCHED_MOVIES}}", label: "Most Watched Movies" },
  { key: "{{CARD_MOST_WATCHED_SHOWS}}", label: "Most Watched TV Shows" },
  { key: "{{CARD_MOST_WATCHED_EPISODES}}", label: "Most Watched Episodes" },
  { key: "{{CARD_POPULAR_MOVIES}}", label: "Most Popular Movies" },
  { key: "{{CARD_POPULAR_SHOWS}}", label: "Most Popular TV Shows" },
  { key: "{{CARD_POPULAR_PLATFORMS}}", label: "Most Popular Streaming Platform" },
  { key: "{{CARD_RECENT_MOVIES}}", label: "Recently added Movies" },
  { key: "{{CARD_RECENT_EPISODES}}", label: "Recently added TV Episodes" },
  { key: "{{CARD_OWNER_RECOMMENDATION}}", label: "Owner Recommendation" },
];

// --- tiny helpers for previewing placeholder content ---
function htmlEscape(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function li(label: string, value: string) {
  return `<li>${htmlEscape(label)} <span style="opacity:.7">— ${htmlEscape(value)}</span></li>`;
}
function cardHtml(title: string, bodyHtml: string) {
  return `<div style="border:1px solid var(--base-300,#e5e7eb);border-radius:12px;padding:16px;background:#fff;margin:16px 0;">
    <h3 style="margin:0 0 10px 0;font-size:16px;line-height:1.2">${htmlEscape(title)}</h3>
    ${bodyHtml}
  </div>`;
}

export default function EmailTemplateCard({ config, save }: Props) {
  const [templateHtml, setTemplateHtml] = useState<string>(config?.template?.html || DEFAULT_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // pull some summary so we can render nice previews for tokens
  const [homeSummary, setHomeSummary] = useState<any>(null);
  useEffect(() => {
    const days = config?.lookbackDays || 7;
    fetch(`http://localhost:5174/tautulli/summary?days=${encodeURIComponent(days)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHomeSummary(j))
      .catch(() => setHomeSummary(null));
  }, [config?.lookbackDays]);

  // keep contentEditable div in sync
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== templateHtml) {
      editorRef.current.innerHTML = templateHtml;
    }
  }, [templateHtml]);

  // simple rich text commands
  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    const el = editorRef.current;
    if (el) setTemplateHtml(el.innerHTML);
  }

  function pickRows(ids: string[]) {
    const blocks = Array.isArray(homeSummary?.home) ? homeSummary.home : [];
    for (const b of blocks) {
      if (ids.includes(String(b?.stat_id || ""))) return Array.isArray(b?.rows) ? b.rows : [];
    }
    return [];
  }

  async function insertTokenAtCaret(token: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    let htmlToInsert: string | null = null;

    try {
      switch (token) {
        case "{{CARD_MOST_WATCHED_MOVIES}}": {
          const rows = pickRows(["top_movies", "most_watched_movies"]);
          const items = (rows || [])
            .filter((r: any) => String(r?.media_type || "").toLowerCase() === "movie")
            .map((r: any) => ({ title: r?.title || "Untitled", year: r?.year, plays: Number(r?.total_plays || r?.plays || 0) }))
            .sort((a: any, b: any) => b.plays - a.plays)
            .slice(0, 5);
          const body = items.length
            ? `<ol>${items.map((x) => li(`${x.title}${x.year ? ` (${x.year})` : ""}`, `${x.plays} plays`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Watched Movies", body);
          break;
        }
        case "{{CARD_MOST_WATCHED_SHOWS}}": {
          const rows = pickRows(["top_tv", "most_watched_tv_shows", "most_watched_tv"]);
          const items = (rows || [])
            .map((r: any) => ({ title: r?.grandparent_title || r?.title || "TV Show", plays: Number(r?.total_plays || r?.plays || 0) }))
            .sort((a: any, b: any) => b.plays - a.plays)
            .slice(0, 5);
          const body = items.length ? `<ol>${items.map((x) => li(x.title, `${x.plays} plays`)).join("")}</ol>` : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Watched TV Shows", body);
          break;
        }
        case "{{CARD_MOST_WATCHED_EPISODES}}": {
          const rows = pickRows(["top_tv", "most_watched_tv_shows", "most_watched_tv"]);
          const items = (rows || [])
            .filter((r: any) => ["episode", "season", "show"].includes(String(r?.media_type || "").toLowerCase()))
            .map((r: any) => {
              const show = r?.grandparent_title || r?.title || "Show";
              const title = r?.title && r?.grandparent_title ? `${show} — ${r.title}` : show;
              return { title, plays: Number(r?.total_plays || r?.plays || 0) };
            })
            .sort((a: any, b: any) => b.plays - a.plays)
            .slice(0, 5);
          const body = items.length ? `<ol>${items.map((x) => li(x.title, `${x.plays} plays`)).join("")}</ol>` : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Watched Episodes", body);
          break;
        }
        case "{{CARD_POPULAR_MOVIES}}": {
          const rows = pickRows(["popular_movies"]);
          const items = (rows || [])
            .filter((r: any) => String(r?.media_type || "").toLowerCase() === "movie")
            .map((r: any) => ({ title: r?.title || "Untitled", year: r?.year, users: Number(r?.users_watched || r?.unique_users || 0) }))
            .sort((a: any, b: any) => b.users - a.users)
            .slice(0, 5);
          const body = items.length
            ? `<ol>${items.map((x) => li(`${x.title}${x.year ? ` (${x.year})` : ""}`, `${x.users} unique viewers`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Popular Movies", body);
          break;
        }
        case "{{CARD_POPULAR_SHOWS}}": {
          const rows = pickRows(["popular_tv", "popular_shows"]);
          const items = (rows || [])
            .map((r: any) => ({ title: r?.grandparent_title || r?.title || "TV Show", users: Number(r?.users_watched || r?.unique_users || 0) }))
            .sort((a: any, b: any) => b.users - a.users)
            .slice(0, 5);
          const body = items.length ? `<ol>${items.map((x) => li(x.title, `${x.users} unique viewers`)).join("")}</ol>` : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Popular TV Shows", body);
          break;
        }
        case "{{CARD_POPULAR_PLATFORMS}}": {
          const rows = pickRows(["top_platforms", "most_used_platforms", "top_clients"]);
          const items = (rows || [])
            .map((r: any) => ({ name: r?.platform || r?.label || "Platform", plays: Number(r?.total_plays || r?.plays || 0) }))
            .sort((a: any, b: any) => b.plays - a.plays)
            .slice(0, 5);
          const body = items.length ? `<ol>${items.map((x) => li(x.name, `${x.plays} plays`)).join("")}</ol>` : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Popular Streaming Platform", body);
          break;
        }
        case "{{CARD_RECENT_MOVIES}}": {
          const body = `<div style="opacity:.75">Preview • Recently added Movies will be inserted here when sending.</div>`;
          htmlToInsert = cardHtml("Recently added Movies", body);
          break;
        }
        case "{{CARD_RECENT_EPISODES}}": {
          const body = `<div style="opacity:.75">Preview • Recently added TV Episodes will be inserted here when sending.</div>`;
          htmlToInsert = cardHtml("Recently added TV Episodes", body);
          break;
        }
        case "{{CARD_OWNER_RECOMMENDATION}}": {
          const id = config?.ownerRecommendation?.plexItemId;
          const note = config?.ownerRecommendation?.note || "";
          let body = `<div style="opacity:.7">No item selected.</div>`;
          try {
            if (id) {
              const r = await fetch(`http://localhost:5174/plex/item/${encodeURIComponent(String(id))}`);
              if (r.ok) {
                const j = await r.json();
                const item = j?.item || null;
                if (item) {
                  const title = item.title || item.grandparentTitle || "Title";
                  const year = item.year ? ` (${item.year})` : "";
                  const href = item.deepLink || item.href || "#";
                  const thumb = item.thumbPath
                    ? `http://localhost:5174/plex/image?path=${encodeURIComponent(item.thumbPath)}`
                    : item.thumb
                    ? `http://localhost:5174/plex/image?u=${encodeURIComponent(item.thumb)}`
                    : "";
                  const img = thumb ? `<img src="${thumb}" alt="" style="width:96px;height:144px;object-fit:cover;border-radius:8px;margin-right:12px" />` : "";
                  const info =
                    `<div><a href="${href}" target="_blank" rel="noreferrer" style="text-decoration:none;color:#93c5fd"><strong>${htmlEscape(title)}${year}</strong></a>` +
                    (note ? `<div style="margin-top:6px">${htmlEscape(note)}</div>` : "") +
                    `</div>`;
                  body = `<div style="display:flex;align-items:flex-start">${img}${info}</div>`;
                }
              }
            }
          } catch {}
          htmlToInsert = cardHtml("Owner Recommendation", body);
          break;
        }
        default:
          htmlToInsert = token;
      }
    } catch {
      htmlToInsert = token;
    }

    if (htmlToInsert) document.execCommand("insertHTML", false, htmlToInsert);
    else document.execCommand("insertText", false, token);

    setTemplateHtml(el.innerHTML);
  }

  async function saveTemplate() {
    try {
      setTemplateSaving(true);
      await save({ template: { html: templateHtml } });
    } finally {
      setTemplateSaving(false);
    }
  }

  function resetTemplate() {
    setTemplateHtml(DEFAULT_TEMPLATE);
  }

  function previewTemplate() {
    const w = window.open("", "_blank");
    if (!w) return alert("Popup blocked");
    const html = templateHtml.trim().startsWith("<!doctype")
      ? templateHtml
      : `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body>${templateHtml}</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Email Template</h2>
          <div className="join">
            <div className="dropdown dropdown-end">
              <label tabIndex={0} className="btn btn-sm join-item">Insert Placeholder</label>
              <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-72">
                {TEMPLATE_TOKENS.map((t) => (
                  <li key={t.key}>
                    <button className="justify-start" onClick={async () => { await insertTokenAtCaret(t.key); }}>
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <button className="btn btn-sm join-item" onClick={() => exec("bold")}><span className="font-bold">B</span></button>
            <button className="btn btn-sm join-item italic" onClick={() => exec("italic")}>I</button>
            <button className="btn btn-sm join-item underline" onClick={() => exec("underline")}>U</button>
            <button className="btn btn-sm join-item" onClick={() => exec("formatBlock", "h2")}>H2</button>
            <button className="btn btn-sm join-item" onClick={() => { const url = prompt("Link URL"); if (url) exec("createLink", url); }}>Link</button>
            <button className="btn btn-sm join-item" onClick={() => exec("insertUnorderedList")}>• List</button>
            <button className="btn btn-sm join-item" onClick={() => exec("insertOrderedList")}>1. List</button>
            <button className="btn btn-sm join-item" onClick={() => exec("removeFormat")}>Clear</button>
          </div>
        </div>

        <div
          ref={editorRef}
          className="min-h-[180px] max-h-[300px] overflow-auto border border-base-300 rounded-lg p-3 prose prose-sm max-w-none bg-base-200"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setTemplateHtml((e.target as HTMLDivElement).innerHTML)}
          style={{ outline: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        />

        <div className="flex items-center justify-end gap-2 mt-3">
          <button className="btn" onClick={resetTemplate}>Reset</button>
          <button className="btn" onClick={previewTemplate}>Preview</button>
          <button className={`btn btn-primary ${templateSaving ? "loading" : ""}`} onClick={saveTemplate} disabled={templateSaving}>
            {templateSaving ? "Saving…" : "Save Template"}
          </button>
        </div>

        <div className="opacity-70 text-xs mt-2">
          Tip: use "Insert Placeholder" to drop in dynamic blocks. Preview shows your raw HTML; sending will replace tokens with real data.
        </div>
      </div>
    </div>
  );
}
