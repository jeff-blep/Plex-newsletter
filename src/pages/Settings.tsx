import React, { useEffect, useMemo, useRef, useState } from "react";
import { getConfig, postConfig, runNow } from "../api";
import TautulliStatsCard from "../components/TautulliStatsCard";
import OwnerRecommendationCard from "../components/OwnerRecommendationCard";

const DEFAULT_TEMPLATE = ``;

// --- Helper types & functions used by placeholder rendering ---
type HomeBlock = { stat_id?: string; rows?: any[] };

function pickHomeRowsFromHome(home: HomeBlock[] | undefined, ids: string[]) {
  const blocks = Array.isArray(home) ? home : [];
  for (const b of blocks) {
    if (ids.includes(String(b?.stat_id || ""))) {
      return Array.isArray(b?.rows) ? b.rows : [];
    }
  }
  return [];
}
function htmlEscape(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function li(label: string, value: string) {
  return `<li>${htmlEscape(label)} <span style="opacity:.7">— ${htmlEscape(value)}</span></li>`;
}
async function fetchSummary(days: number) {
  const r = await fetch(`http://localhost:5174/tautulli/summary?days=${encodeURIComponent(days)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function fetchOwnerItem(plexItemId: string | number | undefined) {
  if (!plexItemId) return null;
  try {
    const r = await fetch(`http://localhost:5174/plex/item/${encodeURIComponent(String(plexItemId))}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.item || null;
  } catch { return null; }
}
function ownerBlockHtml(item: any, note: string) {
  if (!item) {
    return `<div><strong>Owner Recommendation</strong><div style="opacity:.7">No item selected.</div></div>`;
  }
  const title = item.title || item.grandparentTitle || "Title";
  const year = item.year ? ` (${item.year})` : "";
  const href = item.deepLink || item.href || "#";
  const thumb = item.thumbPath
    ? `http://localhost:5174/plex/image?path=${encodeURIComponent(item.thumbPath)}`
    : (item.thumb ? `http://localhost:5174/plex/image?u=${encodeURIComponent(item.thumb)}` : "");
  const img = thumb ? `<img src="${thumb}" alt="" style="width:96px;height:144px;object-fit:cover;border-radius:8px;margin-right:12px" />` : "";
  const info =
    `<div><a href="${href}" target="_blank" rel="noreferrer" style="text-decoration:none;color:#93c5fd"><strong>${htmlEscape(title)}${year}</strong></a>` +
    (note ? `<div style="margin-top:6px">${htmlEscape(note)}</div>` : "") +
    `</div>`;
  return `<div style="display:flex;align-items:flex-start">${img}${info}</div>`;
}

// --- Card HTML helper for card blocks ---
function cardHtml(title: string, bodyHtml: string) {
  return `<div style="border:1px solid var(--base-300,#e5e7eb);border-radius:12px;padding:16px;background:#fff;margin:16px 0;">
    <h3 style="margin:0 0 10px 0;font-size:16px;line-height:1.2">${htmlEscape(title)}</h3>
    ${bodyHtml}
  </div>`;
}

// --- Placeholder menu entries: Only the six requested cards ---
const TEMPLATE_TOKENS: { key: string; label: string }[] = [
  { key: "{{CARD_MOST_WATCHED_MOVIES}}", label: "Most Watched Movies" },
  { key: "{{CARD_MOST_WATCHED_SHOWS}}", label: "Most Watched TV Shows" },
  { key: "{{CARD_MOST_WATCHED_EPISODES}}", label: "Most Watched Episodes" },
  { key: "{{CARD_POPULAR_MOVIES}}", label: "Most Popular Movies" },
  { key: "{{CARD_POPULAR_SHOWS}}", label: "Most Popular TV Shows" },
  { key: "{{CARD_POPULAR_PLATFORMS}}", label: "Most Popular Streaming Platform" },
  { key: "{{CARD_OWNER_RECOMMENDATION}}", label: "Owner Recommendation" },
];

type IncludeKeys = "recentMovies" | "recentEpisodes" | "serverMetrics" | "ownerRecommendation";
type ScheduleMode = "daily" | "weekly" | "custom";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateHtml, setTemplateHtml] = useState<string>("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [homeSummary, setHomeSummary] = useState<any>(null);
  useEffect(() => {
    const days = (config?.lookbackDays || 7);
    fetchSummary(days).then(setHomeSummary).catch(() => setHomeSummary(null));
  }, [config?.lookbackDays]);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getConfig();
      setConfig(cfg);
      setTemplateHtml(cfg?.template?.html || DEFAULT_TEMPLATE);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save(partial: any) {
    setSaving(true);
    setError(null);
    try {
      const updated = await postConfig(partial);
      setConfig(updated);
      (window as any).toast?.success?.("Saved ✓") ?? console.log("Saved ✓");
    } catch (e: any) {
      setError(e?.message || String(e));
      (window as any).toast?.error?.("Save failed: " + (e?.message || e)) ??
        console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    try {
      const res = await runNow();
      (window as any).toast?.success?.("Sent: " + JSON.stringify(res.sent)) ??
        alert("Sent: " + JSON.stringify(res.sent));
    } catch (e: any) {
      (window as any).toast?.error?.("Run failed: " + (e?.message || e)) ??
        alert("Run failed: " + (e?.message || e));
    }
  }

  function setScheduleMode(mode: ScheduleMode) {
    if (mode === "custom") {
      const cron =
        prompt("Enter CRON expression (min hour day month weekday)", config?.schedule?.cron || "0 9 * * 1") ||
        config?.schedule?.cron ||
        "0 9 * * 1";
      save({ schedule: { mode, cron } });
    } else {
      save({ schedule: { mode } });
    }
  }

  function addRecipient() {
    const name = prompt("Recipient name?") || "";
    const email = prompt("Recipient email?") || "";
    if (!email) return;
    save({ recipients: [...(config.recipients || []), { name, email }] });
  }
  function removeRecipient(index: number) {
    const next = [...(config.recipients || [])];
    next.splice(index, 1);
    save({ recipients: next });
  }
  function editRecipient(index: number) {
    const r = config.recipients[index];
    const name = prompt("Name:", r.name || "") ?? r.name;
    const email = prompt("Email:", r.email || "") ?? r.email;
    const next = [...config.recipients];
    next[index] = { name, email };
    save({ recipients: next });
  }
  function toggleInclude(k: IncludeKeys, val: boolean) {
    save({ include: { [k]: val } });
  }

  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    // sync state with current editor html
    const el = editorRef.current;
    if (el) setTemplateHtml(el.innerHTML);
  }
  async function insertTokenAtCaret(token: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    // Default: insert raw token text
    let htmlToInsert: string | null = null;

    try {
      switch (token) {
        case "{{CARD_MOST_WATCHED_MOVIES}}": {
          const rows = pickHomeRowsFromHome(homeSummary?.home, ["top_movies","most_watched_movies"]);
          const items = (rows || [])
            .filter((r:any) => String(r?.media_type||"").toLowerCase()==="movie")
            .map((r:any)=>({title:r?.title||"Untitled",year:r?.year,plays:Number(r?.total_plays||r?.plays||0)}))
            .sort((a:any,b:any)=>b.plays-a.plays).slice(0,5);
          const body = items.length
            ? `<ol>${items.map(x=>li(`${x.title}${x.year?` (${x.year})`:""}`, `${x.plays} plays`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Watched Movies", body);
          break;
        }
        case "{{CARD_MOST_WATCHED_SHOWS}}": {
          const rows = pickHomeRowsFromHome(homeSummary?.home, ["top_tv","most_watched_tv_shows","most_watched_tv"]);
          const items = (rows || [])
            .map((r:any)=>({title:r?.grandparent_title||r?.title||"TV Show",plays:Number(r?.total_plays||r?.plays||0)}))
            .sort((a:any,b:any)=>b.plays-a.plays).slice(0,5);
          const body = items.length
            ? `<ol>${items.map(x=>li(x.title, `${x.plays} plays`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Watched TV Shows", body);
          break;
        }
        case "{{CARD_MOST_WATCHED_EPISODES}}": {
          const rows = pickHomeRowsFromHome(homeSummary?.home, ["top_tv","most_watched_tv_shows","most_watched_tv"]);
          const items = (rows || [])
            .filter((r:any)=>["episode","season","show"].includes(String(r?.media_type||"").toLowerCase()))
            .map((r:any)=>{
              const show = r?.grandparent_title || r?.title || "Show";
              const title = r?.title && r?.grandparent_title ? `${show} — ${r.title}` : show;
              return {title, plays:Number(r?.total_plays||r?.plays||0)};
            })
            .sort((a:any,b:any)=>b.plays-a.plays).slice(0,5);
          const body = items.length
            ? `<ol>${items.map(x=>li(x.title, `${x.plays} plays`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Watched Episodes", body);
          break;
        }
        case "{{CARD_POPULAR_MOVIES}}": {
          const rows = pickHomeRowsFromHome(homeSummary?.home, ["popular_movies"]);
          const items = (rows || [])
            .filter((r:any)=>String(r?.media_type||"").toLowerCase()==="movie")
            .map((r:any)=>({title:r?.title||"Untitled",year:r?.year,users:Number(r?.users_watched||r?.unique_users||0)}))
            .sort((a:any,b:any)=>b.users-a.users).slice(0,5);
          const body = items.length
            ? `<ol>${items.map(x=>li(`${x.title}${x.year?` (${x.year})`:""}`, `${x.users} unique viewers`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Popular Movies", body);
          break;
        }
        case "{{CARD_POPULAR_SHOWS}}": {
          const rows = pickHomeRowsFromHome(homeSummary?.home, ["popular_tv","popular_shows"]);
          const items = (rows || [])
            .map((r:any)=>({title:r?.grandparent_title||r?.title||"TV Show",users:Number(r?.users_watched||r?.unique_users||0)}))
            .sort((a:any,b:any)=>b.users-a.users).slice(0,5);
          const body = items.length
            ? `<ol>${items.map(x=>li(x.title, `${x.users} unique viewers`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Popular TV Shows", body);
          break;
        }
        case "{{CARD_POPULAR_PLATFORMS}}": {
          const rows = pickHomeRowsFromHome(homeSummary?.home, ["top_platforms","most_used_platforms","top_clients"]);
          const items = (rows || [])
            .map((r:any)=>({name:r?.platform||r?.label||"Platform",plays:Number(r?.total_plays||r?.plays||0)}))
            .sort((a:any,b:any)=>b.plays-a.plays).slice(0,5);
          const body = items.length
            ? `<ol>${items.map(x=>li(x.name, `${x.plays} plays`)).join("")}</ol>`
            : `<div style="opacity:.7">No data</div>`;
          htmlToInsert = cardHtml("Most Popular Streaming Platform", body);
          break;
        }
        case "{{CARD_OWNER_RECOMMENDATION}}": {
          const id = config?.ownerRecommendation?.plexItemId;
          const note = config?.ownerRecommendation?.note || "";
          const item = await fetchOwnerItem(id);
          const body = ownerBlockHtml(item, note);
          htmlToInsert = cardHtml("Owner Recommendation", body);
          break;
        }
        default:
          htmlToInsert = token;
      }
    } catch {
      htmlToInsert = token;
    }

    // Insert HTML (or plain text as fallback)
    if (htmlToInsert) {
      document.execCommand("insertHTML", false, htmlToInsert);
    } else {
      document.execCommand("insertText", false, token);
    }
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
    // wrap current HTML if it doesn't look like full doc
    const html = templateHtml.trim().startsWith("<!doctype") ? templateHtml : `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body>${templateHtml}</body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // Cache some plex deep-link pieces in localStorage for OwnerRecommendation card.
  useEffect(() => {
    try {
      const plex = config?.plex || {};
      if (plex?.webBase) localStorage.setItem("plex.webBase", plex.webBase);
      if (plex?.machineIdentifier) localStorage.setItem("plex.machineIdentifier", plex.machineIdentifier);
      if (plex?.serverId) localStorage.setItem("plexServerId", plex.serverId);
      if (plex?.token) localStorage.setItem("plex.token", plex.token);
      if (plex?.url) localStorage.setItem("plex.url", plex.url);
    } catch {
      // ignore
    }
  }, [config]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== templateHtml) {
      editorRef.current.innerHTML = templateHtml;
    }
  }, [templateHtml]);

  const scheduleMode: ScheduleMode = (config?.schedule?.mode || "weekly") as ScheduleMode;
  const lookback = config?.lookbackDays || 7;
  const maskedFrom = useMemo(() => config?.smtp?.from || "(not set)", [config]);

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-6">
        <div className="alert alert-error max-w-lg">
          <span>Error loading settings: {error}</span>
          <button className="btn btn-sm ml-auto" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="alert">No config loaded.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Top Nav */}
      <div className="navbar bg-base-100 shadow">
        <div className="flex-1 px-2">
          <span className="text-lg font-semibold">Plex Newsletter • Settings</span>
        </div>
        <div className="flex-none gap-2 pr-2">
          <button className="btn btn-accent" onClick={handleRunNow} disabled={saving}>
            Send Newsletter Now
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-6 grid gap-6">
        {/* Summary */}
        <div className="stats shadow bg-base-100">
          <div className="stat">
            <div className="stat-title">Schedule</div>
            <div className="stat-value text-lg capitalize">{scheduleMode}</div>
            <div className="stat-desc">
              {scheduleMode === "custom"
                ? (config.schedule?.cron || "")
                : scheduleMode === "daily"
                ? "Every day at 09:00"
                : "Mondays at 09:00"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">Lookback</div>
            <div className="stat-value text-lg">{lookback}d</div>
            <div className="stat-desc">How far back to pull data</div>
          </div>
          <div className="stat">
            <div className="stat-title">From</div>
            <div className="stat-value text-lg truncate">{maskedFrom}</div>
            <div className="stat-desc">SMTP sender address</div>
          </div>
        </div>

        {/* Schedule */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Schedule</h2>
            <div className="join">
              <button
                className={`btn join-item ${scheduleMode === "daily" ? "btn-primary" : ""}`}
                onClick={() => setScheduleMode("daily")}
              >
                Daily (9am)
              </button>
              <button
                className={`btn join-item ${scheduleMode === "weekly" ? "btn-primary" : ""}`}
                onClick={() => setScheduleMode("weekly")}
              >
                Weekly (Mon 9am)
              </button>
              <button
                className={`btn join-item ${scheduleMode === "custom" ? "btn-primary" : ""}`}
                onClick={() => setScheduleMode("custom")}
              >
                Custom CRON…
              </button>
            </div>
            {scheduleMode === "custom" ? (
              <div className="text-sm opacity-70">
                Current cron: <code>{config.schedule?.cron || "n/a"}</code>
              </div>
            ) : null}
          </div>
        </div>

        {/* Include Sections */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Include in Newsletter</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                ["recentMovies", "Recently added Movies"],
                ["recentEpisodes", "Recently added TV Episodes"],
                ["serverMetrics", "Server metrics (weekly graphs)"],
                ["ownerRecommendation", "Owner recommendation section"],
              ] as [IncludeKeys, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="toggle"
                    checked={!!config.include?.[key]}
                    onChange={(e) => toggleInclude(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Lookback */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Lookback Window</h2>
            <label className="form-control w-full max-w-xs">
              <div className="label">
                <span className="label-text">Days to look back</span>
              </div>
              <input
                type="number"
                min={1}
                className="input input-bordered w-full max-w-xs"
                value={lookback}
                onChange={(e) => save({ lookbackDays: Math.max(1, Number(e.target.value || 1)) })}
              />
            </label>
          </div>
        </div>

        {/* Tautulli Stats */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Tautulli Stats (Last {lookback} days)</h2>
            <TautulliStatsCard days={lookback} />
          </div>
        </div>

        {/* Owner Recommendation */}
        <OwnerRecommendationCard config={config} save={save} />

        {/* Email Template (WYSIWYG) */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Email Template</h2>
              <div className="join">
                <div className="dropdown dropdown-end">
                  <label tabIndex={0} className="btn btn-sm join-item">Insert Placeholder</label>
                  <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-72">
                    {TEMPLATE_TOKENS.map(t => (
                      <li key={t.key}>
                        <button className="justify-start" onClick={async () => { await insertTokenAtCaret(t.key); }}>{t.label}</button>
                      </li>
                    ))}
                  </ul>
                </div>
                <button className="btn btn-sm join-item" onClick={() => exec('bold')}><span className="font-bold">B</span></button>
                <button className="btn btn-sm join-item italic" onClick={() => exec('italic')}>I</button>
                <button className="btn btn-sm join-item underline" onClick={() => exec('underline')}>U</button>
                <button className="btn btn-sm join-item" onClick={() => exec('formatBlock','h2')}>H2</button>
                <button className="btn btn-sm join-item" onClick={() => { const url = prompt('Link URL'); if (url) exec('createLink', url); }}>Link</button>
                <button className="btn btn-sm join-item" onClick={() => exec('insertUnorderedList')}>• List</button>
                <button className="btn btn-sm join-item" onClick={() => exec('insertOrderedList')}>1. List</button>
                <button className="btn btn-sm join-item" onClick={() => exec('removeFormat')}>Clear</button>
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
              Tip: use "Insert Placeholder" to drop in dynamic blocks. The Preview shows your raw HTML; sending will later replace tokens with real data.
            </div>
          </div>
        </div>

        {/* Recipients */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Recipients</h2>
              <button className="btn btn-primary" onClick={addRecipient}>
                Add Recipient
              </button>
            </div>
            {(!config.recipients || config.recipients.length === 0) ? (
              <div className="alert">
                <span>No recipients yet. Add at least one to enable sending.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.recipients.map((r: any, i: number) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{r.name || "-"}</td>
                        <td>{r.email}</td>
                        <td className="text-right">
                          <div className="join">
                            <button className="btn btn-ghost join-item" onClick={() => editRecipient(i)}>
                              Edit
                            </button>
                            <button className="btn btn-error join-item" onClick={() => removeRecipient(i)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Changes save immediately.</div>
              <div className="join">
                <button className="btn join-item" onClick={refresh} disabled={saving}>
                  Reload
                </button>
                <button className="btn btn-accent join-item" onClick={handleRunNow} disabled={saving}>
                  Send Newsletter Now
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
