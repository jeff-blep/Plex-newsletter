// src/pages/Settings.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getConfig, postConfig, runNow } from "../api";
import TautulliStatsCard from "../components/TautulliStatsCard";
import OwnerRecommendationCard from "../components/OwnerRecommendationCard";

const DEFAULT_TEMPLATE = ``;

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
  return String(s ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
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

function cardHtml(title: string, bodyHtml: string) {
  return `<div style="border:1px solid var(--base-300,#e5e7eb);border-radius:12px;padding:16px;background:#fff;margin:16px 0;">
    <h3 style="margin:0 0 10px 0;font-size:16px;line-height:1.2">${htmlEscape(title)}</h3>
    ${bodyHtml}
  </div>`;
}

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

type ScheduleMode = "daily" | "weekly" | "custom";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // template editor
  const [templateHtml, setTemplateHtml] = useState<string>("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  // summary block for previewing certain placeholders
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

  // Schedule modal state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<any>(null);

  // SMTP modal state
  const [smtpOpen, setSmtpOpen] = useState(false);
  const [smtpDraft, setSmtpDraft] = useState<any>(null);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  // formatting commands for the editor
  function exec(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    const el = editorRef.current;
    if (el) setTemplateHtml(el.innerHTML);
  }

  async function insertTokenAtCaret(token: string) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

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
    const html = templateHtml.trim().startsWith("<!doctype")
      ? templateHtml
      : `<!doctype html><html><head><meta charset="utf-8"><title>Preview</title></head><body>${templateHtml}</body></html>`;
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
    } catch { /* ignore */ }
  }, [config]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== templateHtml) {
      editorRef.current.innerHTML = templateHtml;
    }
  }, [templateHtml]);

  const scheduleMode: ScheduleMode = (config?.schedule?.mode || "weekly") as ScheduleMode;
  const lookback = config?.lookbackDays || 7;
  const maskedFrom = useMemo(() => config?.smtp?.from || "(not set)", [config]);

  function describeSchedule(): string {
    const s = config?.schedule || {};
    if (s.frequency) {
      const freq = String(s.frequency).toLowerCase();
      const hh = typeof s.hour === 'number' ? s.hour : 9;
      const mm = typeof s.minute === 'number' ? s.minute : 0;
      const ampm = hh >= 12 ? 'PM' : 'AM';
      const hour12 = ((hh + 11) % 12) + 1;
      const t = `${hour12}:${String(mm).padStart(2, '0')} ${ampm}`;
      if (freq === 'week') {
        const day = (s.dayOfWeek || 'monday');
        const dayCap = String(day).slice(0,1).toUpperCase() + String(day).slice(1);
        return `${dayCap}s at ${t}`;
      }
      if (freq === 'hour') return `Every hour at minute ${mm}`;
      if (freq === 'month') {
        const dom = Number(s.dayOfMonth || 1);
        const sfx = ["th","st","nd","rd"][(dom%100-20)%10] || ["th","st","nd","rd"][dom%10] || "th";
        return `Monthly on the ${dom}${sfx} at ${t}`;
      }
      if (freq === 'year') {
        const m = Math.max(1, Math.min(12, Number(s.month || 1)));
        const monthName = [
          'January','February','March','April','May','June','July','August','September','October','November','December'
        ][m-1];
        return `Yearly on ${monthName} 1 at ${t}`;
      }
      return `Daily at ${t}`;
    }
    const mode: ScheduleMode = (config?.schedule?.mode || 'weekly') as ScheduleMode;
    if (mode === 'custom') return config?.schedule?.cron || 'Custom schedule';
    if (mode === 'daily') return 'Every day at 09:00';
    return 'Mondays at 09:00';
  }

  async function editSchedule() {
    const s = config?.schedule || {};
    let draft: any;
    if (s.frequency) {
      draft = {
        frequency: s.frequency || 'week',
        dayOfWeek: s.dayOfWeek || 'monday',
        hour: typeof s.hour === 'number' ? s.hour : 9,
        minute: typeof s.minute === 'number' ? s.minute : 0,
        cron: s.cron || '',
        dayOfMonth: typeof s.dayOfMonth === 'number' ? s.dayOfMonth : 1,
        month: typeof s.month === 'number' ? s.month : 1,
      };
    } else {
      draft = { frequency: 'week', dayOfWeek: 'monday', hour: 9, minute: 0, cron: s.cron || '', dayOfMonth: 1, month: 1 };
    }
    setScheduleDraft(draft);
    setScheduleOpen(true);
  }

  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const HOURS12 = Array.from({length:12}, (_,i)=>i+1);
  const MINUTES = Array.from({length:12}, (_,i)=>i*5);
  const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);
  const MONTHS = [
    'January','February','March','April','May','June','July','August','September','October','November','December'
  ];
  function to24h(hour12: number, ampm: 'AM'|'PM') {
    const h = Number(hour12);
    return ampm === 'AM' ? (h % 12) : ((h % 12) + 12);
  }

  async function saveScheduleFromDraft() {
    const d = scheduleDraft || {};
    const cron = String(d.cron || '').trim();
    if (cron) {
      await save({ schedule: { mode: 'custom', cron } });
      setScheduleOpen(false);
      return;
    }
    const freq = String(d.frequency || 'week').toLowerCase();
    const derivedAmpm: 'AM'|'PM' = d.ampm ?? ((Number(d.hour ?? 9) >= 12) ? 'PM' : 'AM');
    let hour = typeof d.hour === 'number' ? d.hour : 9;
    if (d.hour12) hour = to24h(Number(d.hour12), derivedAmpm);
    const minute = Math.max(0, Math.min(59, Number(d.minute) || 0));
    const payload: any = { frequency: freq, hour, minute };
    if (freq === 'week') payload.dayOfWeek = d.dayOfWeek || 'monday';
    if (freq === 'month') payload.dayOfMonth = Math.max(1, Math.min(31, Number(d.dayOfMonth) || 1));
    if (freq === 'year') payload.month = Math.max(1, Math.min(12, Number(d.month) || 1));
    await save({ schedule: payload });
    setScheduleOpen(false);
  }

  async function editFrom() {
    const cur = config?.smtp || {};
    setSmtpDraft({
      host: cur.host || "",
      port: typeof cur.port === "number" ? cur.port : Number(cur.port) || 587,
      security: cur.secure ? "ssl" : (cur.starttls ? "starttls" : "none"),
      authUser: cur.auth?.user || cur.user || "",
      authPass: "__PRESERVE__",
      fromName: cur.fromName || cur.name || "",
      from: cur.from || cur.address || "",
      replyTo: cur.replyTo || "",
    });
    setSmtpTestResult(null);
    setSmtpOpen(true);
  }

  function normalizeSmtpDraft(d: any) {
    const port = Math.max(1, Math.min(65535, Number(d.port) || 587));
    const secure = d.security === "ssl";
    const starttls = d.security === "starttls";
    const out: any = {
      host: String(d.host || "").trim(),
      port,
      secure,
      starttls,
      auth: {
        user: String(d.authUser || "").trim(),
        pass: d.authPass === "__PRESERVE__" ? (config?.smtp?.auth?.pass || config?.smtp?.pass || "") : String(d.authPass || ""),
      },
      fromName: String(d.fromName || "").trim(),
      from: String(d.from || "").trim(),
      replyTo: String(d.replyTo || "").trim(),
    };
    return out;
  }

  async function saveSmtp() {
    const d = normalizeSmtpDraft(smtpDraft || {});
    if (!d.host) { (window as any).toast?.error?.("SMTP Host is required"); return; }
    if (!d.from) { (window as any).toast?.error?.("From Email is required"); return; }
    await save({ smtp: d });
    setSmtpOpen(false);
  }

  async function testSmtp() {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const payload = normalizeSmtpDraft(smtpDraft || {});
      const res = await fetch("http://localhost:5174/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp: payload, to: payload.from })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
      setSmtpTestResult({ ok: true, message: body?.message || "Connection OK and test email queued." });
    } catch (e: any) {
      setSmtpTestResult({ ok: false, message: e?.message || String(e) });
    } finally {
      setSmtpTesting(false);
    }
  }

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
          <button className="btn btn-sm ml-auto" onClick={refresh}>Retry</button>
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
        {/* Consolidated Delivery Settings: three clickable mini-cards on one row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sending Schedule */}
          <div className="card bg-base-100 shadow hover:shadow-md transition-shadow cursor-pointer" onClick={editSchedule}>
            <div className="card-body">
              <div className="card-title">Sending Schedule</div>
              <div className="text-sm opacity-70 mb-1">When the newsletter will be automatically sent</div>
              <div className="text-sm">{describeSchedule()}</div>
            </div>
          </div>

          {/* History (editable number) */}
          <div className="card bg-base-100 shadow hover:shadow-md transition-shadow">
            <div className="card-body">
              <div className="card-title">History</div>
              <div className="text-sm opacity-70 mb-1">How many days to pull data for the newsletter</div>
              <label className="form-control w-full max-w-xs">
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="input input-bordered w-full max-w-xs"
                  value={lookback}
                  onChange={(e) => {
                    const v = Number(e.target.value || 1);
                    const n = Math.max(1, Math.min(365, v|0));
                    if (n !== lookback) save({ lookbackDays: n });
                  }}
                />
              </label>
            </div>
          </div>

          {/* Outgoing Email */}
          <div className="card bg-base-100 shadow hover:shadow-md transition-shadow cursor-pointer" onClick={editFrom}>
            <div className="card-body">
              <div className="card-title">Outgoing Email</div>
              <div className="text-sm opacity-70 mb-1">Sender address used for the newsletter</div>
              <div className="text-sm truncate">{maskedFrom}</div>
            </div>
          </div>
        </div>

        {/* Tautulli Stats */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Tautulli Stats (Last {config?.lookbackDays || 7} days)</h2>
            <TautulliStatsCard days={config?.lookbackDays || 7} />
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
              <button className="btn btn-primary" onClick={() => {
                const name = prompt("Recipient name?") || "";
                const email = prompt("Recipient email?") || "";
                if (!email) return;
                save({ recipients: [...(config.recipients || []), { name, email }] });
              }}>Add Recipient</button>
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
                            <button className="btn btn-ghost join-item" onClick={() => {
                              const nr = [...config.recipients];
                              const name = prompt("Name:", r.name || "") ?? r.name;
                              const email = prompt("Email:", r.email || "") ?? r.email;
                              nr[i] = { name, email };
                              save({ recipients: nr });
                            }}>Edit</button>
                            <button className="btn btn-error join-item" onClick={() => {
                              const nr = [...(config.recipients || [])];
                              nr.splice(i,1);
                              save({ recipients: nr });
                            }}>Remove</button>
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
                <button className="btn join-item" onClick={refresh} disabled={saving}>Reload</button>
                <button className="btn btn-accent join-item" onClick={handleRunNow} disabled={saving}>Send Newsletter Now</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {scheduleOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-2">Sending Schedule</h3>
            <p className="text-sm opacity-70 mb-4">Choose when the newsletter is sent automatically.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Frequency */}
              <label className="form-control">
                <div className="label"><span className="label-text">Every</span></div>
                <select className="select select-bordered"
                  value={scheduleDraft?.frequency || 'week'}
                  onChange={(e)=>setScheduleDraft({...scheduleDraft, frequency:e.target.value})}
                >
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>

              {/* Day of week (only for weekly) */}
              {String(scheduleDraft?.frequency||'').toLowerCase()==='week' && (
                <label className="form-control">
                  <div className="label"><span className="label-text">On</span></div>
                  <select className="select select-bordered"
                    value={scheduleDraft?.dayOfWeek || 'monday'}
                    onChange={(e)=>setScheduleDraft({...scheduleDraft, dayOfWeek:e.target.value})}
                  >
                    {DAYS.map(d=> <option key={d} value={d}>{d[0].toUpperCase()+d.slice(1)}</option>)}
                  </select>
                </label>
              )}

              {/* Day of month (only for monthly) */}
              {String(scheduleDraft?.frequency||'').toLowerCase()==='month' && (
                <label className="form-control">
                  <div className="label"><span className="label-text">Day</span><span className="label-text-alt opacity-70">1–31</span></div>
                  <select className="select select-bordered"
                    value={scheduleDraft?.dayOfMonth ?? 1}
                    onChange={(e)=>setScheduleDraft({...scheduleDraft, dayOfMonth:Number(e.target.value)})}
                  >
                    {DAYS_OF_MONTH.map(d=> <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div className="label"><span className="label-text-alt opacity-70">If a month has fewer days, it will send on the last day.</span></div>
                </label>
              )}

              {/* Month of year (only for yearly) */}
              {String(scheduleDraft?.frequency||'').toLowerCase()==='year' && (
                <label className="form-control">
                  <div className="label"><span className="label-text">Month</span></div>
                  <select className="select select-bordered"
                    value={scheduleDraft?.month ?? 1}
                    onChange={(e)=>setScheduleDraft({...scheduleDraft, month:Number(e.target.value)})}
                  >
                    {MONTHS.map((m,idx)=> <option key={idx+1} value={idx+1}>{m}</option>)}
                  </select>
                  <div className="label"><span className="label-text-alt opacity-70">Will send on the 1st of the selected month.</span></div>
                </label>
              )}

              {/* Time row: Hour / Minute / AM-PM */}
              <div className="grid grid-cols-3 gap-3 md:col-span-2">
                {/* Hour */}
                <label className="form-control">
                  <div className="label"><span className="label-text">Hour</span></div>
                  <select className="select select-bordered"
                    value={scheduleDraft?.hour12 ?? ((((scheduleDraft?.hour ?? 9)+11)%12)+1)}
                    onChange={(e)=>setScheduleDraft({...scheduleDraft, hour12:Number(e.target.value)})}
                  >
                    {HOURS12.map(h=> <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>

                {/* Minute (5-min increments) */}
                <label className="form-control">
                  <div className="label"><span className="label-text">Minute</span></div>
                  <select className="select select-bordered"
                    value={scheduleDraft?.minute ?? 0}
                    onChange={(e)=>setScheduleDraft({...scheduleDraft, minute:Number(e.target.value)})}
                  >
                    {MINUTES.map(m=> <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
                  </select>
                </label>

                {/* AM/PM */}
                <label className="form-control">
                  <div className="label"><span className="label-text">AM / PM</span></div>
                  <select className="select select-bordered"
                    value={scheduleDraft?.ampm ?? ((scheduleDraft?.hour ?? 9) >= 12 ? 'PM' : 'AM')}
                    onChange={(e)=>setScheduleDraft({...scheduleDraft, ampm:e.target.value as 'AM'|'PM'})}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-4">
              <label className="form-control">
                <div className="label"><span className="label-text">Custom CRON (optional)</span><span className="label-text-alt opacity-70">Overrides the selections above</span></div>
                <input
                  className="input input-bordered"
                  placeholder="e.g., 0 9 * * 1"
                  value={scheduleDraft?.cron ?? ''}
                  onChange={(e)=>setScheduleDraft({...scheduleDraft, cron:e.target.value})}
                />
              </label>
            </div>

            <div className="modal-action">
              <button className="btn" onClick={()=>setScheduleOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveScheduleFromDraft}>Save</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={()=>setScheduleOpen(false)}></div>
        </div>
      )}

      {/* SMTP Modal */}
      {smtpOpen && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-2">Outgoing Email Setup</h3>
            <p className="text-sm opacity-70 mb-4">Edit the SMTP connection and sender details used to send the newsletter.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Host */}
              <label className="form-control">
                <div className="label"><span className="label-text">SMTP Host</span></div>
                <input className="input input-bordered" value={smtpDraft?.host || ''} onChange={(e)=>setSmtpDraft({...smtpDraft, host:e.target.value})} placeholder="smtp.example.com" />
              </label>
              {/* Port */}
              <label className="form-control">
                <div className="label"><span className="label-text">Port</span></div>
                <input type="number" min={1} max={65535} className="input input-bordered" value={smtpDraft?.port ?? 587} onChange={(e)=>setSmtpDraft({...smtpDraft, port:Number(e.target.value)})} />
              </label>
              {/* Security */}
              <label className="form-control">
                <div className="label"><span className="label-text">Security</span></div>
                <select className="select select-bordered" value={smtpDraft?.security || 'starttls'} onChange={(e)=>setSmtpDraft({...smtpDraft, security:e.target.value})}>
                  <option value="none">None</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="ssl">SSL/TLS</option>
                </select>
              </label>
              {/* Username */}
              <label className="form-control">
                <div className="label"><span className="label-text">Login (Username)</span></div>
                <input className="input input-bordered" value={smtpDraft?.authUser || ''} onChange={(e)=>setSmtpDraft({...smtpDraft, authUser:e.target.value})} />
              </label>
              {/* Password */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Password</span><span className="label-text-alt opacity-70">Leave as-is to keep current</span></div>
                <input type="password" className="input input-bordered" value={smtpDraft?.authPass || ''} onChange={(e)=>setSmtpDraft({...smtpDraft, authPass:e.target.value})} />
              </label>
              {/* From Name */}
              <label className="form-control">
                <div className="label"><span className="label-text">From Name</span></div>
                <input className="input input-bordered" value={smtpDraft?.fromName || ''} onChange={(e)=>setSmtpDraft({...smtpDraft, fromName:e.target.value})} placeholder="Plex Newsletter" />
              </label>
              {/* From Email */}
              <label className="form-control">
                <div className="label"><span className="label-text">From Email Address</span></div>
                <input className="input input-bordered" value={smtpDraft?.from || ''} onChange={(e)=>setSmtpDraft({...smtpDraft, from:e.target.value})} placeholder="newsletter@example.com" />
              </label>
              {/* Reply-To */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Reply-To (optional)</span></div>
                <input className="input input-bordered" value={smtpDraft?.replyTo || ''} onChange={(e)=>setSmtpDraft({...smtpDraft, replyTo:e.target.value})} placeholder="support@example.com" />
              </label>
            </div>

            {/* Test + Save actions */}
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-3">
                <button className={`btn ${smtpTesting ? 'loading' : ''}`} onClick={testSmtp} disabled={smtpTesting}>Test</button>
                {smtpTestResult && (
                  smtpTestResult.ok ? (
                    <div className="text-success flex items-center gap-1">
                      <span>✔</span>
                      <span className="text-sm">{smtpTestResult.message || 'SMTP OK'}</span>
                    </div>
                  ) : (
                    <div className="text-error flex items-center gap-1">
                      <span>✖</span>
                      <span className="text-sm">{smtpTestResult.message || 'Test failed'}</span>
                    </div>
                  )
                )}
              </div>
              <div className="modal-action m-0">
                <button className="btn" onClick={()=>setSmtpOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveSmtp}>Save</button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop" onClick={()=>setSmtpOpen(false)}></div>
        </div>
      )}
    </div>
  );
}
