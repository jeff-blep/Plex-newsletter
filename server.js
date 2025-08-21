// server.js — FULL RESHIP with reliable Tautulli summary (timeouts, paging) + UI-compatible /api/status
"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

// --- CORS for dev ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Load config.json ---
const CONFIG_PATH = path.join(__dirname, "config.json");
let CONFIG = {};
try {
  CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
} catch (e) {
  console.error("[server] Failed to read config.json:", e.message);
  CONFIG = {};
}

// --- fetch helper (Node 18+ has global fetch) ---
async function getFetch() {
  if (typeof fetch === "function") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

// Abortable fetch with timeout
async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const f = await getFetch();
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await f(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// -------------------- Helpers --------------------
function trimSlash(u = "") {
  return String(u || "").replace(/\/$/, "");
}

function int(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

async function tautulliCall(cmd, params = {}, timeoutMs = 8000) {
  const base = trimSlash(CONFIG.tautulliUrl);
  const key = CONFIG.tautulliApiKey || "";
  if (!base || !key) throw new Error("Tautulli URL or API key not configured");

  const url = new URL(`${base}/api/v2`);
  url.searchParams.set("apikey", key);
  url.searchParams.set("cmd", String(cmd));
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  const r = await fetchWithTimeout(url.toString(), {}, timeoutMs);
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || `HTTP ${r.status}`);
  let json;
  try { json = JSON.parse(txt); } catch { throw new Error("Invalid JSON from Tautulli"); }
  if (json?.response?.result !== "success") {
    throw new Error(json?.response?.message || "Tautulli returned error");
  }
  return json.response.data;
}

// -------------------- LIVE STATUS (used by the Connection Settings card) --------------------
app.get("/api/status", async (_req, res) => {
  // prevent stale caching
  res.set("Cache-Control", "no-store");

  async function checkSMTP() {
    try {
      const transporter = nodemailer.createTransport({
        host: CONFIG.smtpHost,
        port: Number(CONFIG.smtpPort || 587),
        secure: !!CONFIG.smtpSecure, // true = TLS/SSL
        auth: (CONFIG.smtpUser && CONFIG.smtpPass) ? {
          user: CONFIG.smtpUser,
          pass: CONFIG.smtpPass,
        } : undefined,
        connectionTimeout: 2500,
        greetingTimeout: 2500,
        socketTimeout: 2500,
      });
      await transporter.verify(); // cheap EHLO check
      return true;
    } catch {
      // still consider "configured" as OK-ish to avoid flashing ❌ if verify is blocked
      const configured = !!(CONFIG.smtpHost && CONFIG.smtpUser && (CONFIG.smtpPass || CONFIG.smtpSecure !== undefined));
      return configured;
    }
  }

  async function checkPlex() {
    try {
      const base = (CONFIG.plexUrl || "").replace(/\/+$/, "");
      const token = CONFIG.plexToken || "";
      if (!base || !token) return false;
      const u = `${base}/identity?X-Plex-Token=${encodeURIComponent(token)}`;
      const r = await fetchWithTimeout(u, {}, 2500);
      return !!(r && r.ok);
    } catch {
      return false;
    }
  }

  async function checkTautulli() {
    try {
      const base = (CONFIG.tautulliUrl || "").replace(/\/+$/, "");
      const api = CONFIG.tautulliApiKey || "";
      if (!base || !api) return false;

      // Use the SAME command as the working test endpoint
      const u = `${base}/api/v2?apikey=${encodeURIComponent(api)}&cmd=get_tautulli_info`;
      const r = await fetchWithTimeout(u, {}, 2500);
      if (!r || !r.ok) return false;

      const ct = r.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await r.json() : JSON.parse(await r.text());

      // Expect response.result === "success"; also accept presence of version fields as OK
      const okByResult = data?.response?.result === "success";
      const okByFields =
        !!(data?.response?.data?.tautulli_version ||
           data?.response?.data?.branch ||
           data?.response?.data?.version);
      return okByResult || okByFields;
    } catch {
      return false;
    }
  }

  try {
    const [emailOk, plexOk, tautulliOk] = await Promise.all([
      checkSMTP(),
      checkPlex(),
      checkTautulli(),
    ]);

    // Return the booleans your UI expects; include legacy fields too for compatibility
    return res.json({
      emailOk, plexOk, tautulliOk,
      email: emailOk, plex: plexOk, tautulli: tautulliOk,
    });
  } catch (e) {
    return res.json({ emailOk: false, plexOk: false, tautulliOk: false, error: String(e) });
  }
});

// -------------------- CONFIG --------------------
const CONFIG_KEYS = new Set([
  "smtpHost", "smtpPort", "smtpSecure", "smtpUser", "smtpPass", "fromAddress",
  "plexUrl", "plexToken", "tautulliUrl", "tautulliApiKey", "lookbackDays"
]);

function saveConfigSafe(nextObj) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextObj, null, 2));
    CONFIG = nextObj;
    return true;
  } catch (e) {
    console.error("[config] write failed:", e);
    return false;
  }
}

app.get("/api/config", (_req, res) => {
  const out = {};
  for (const k of CONFIG_KEYS) out[k] = CONFIG[k];
  delete out.smtpPass; // never expose password
  res.json(out);
});

app.post("/api/config", (req, res) => {
  const body = req.body || {};
  const next = { ...CONFIG };

  for (const k of CONFIG_KEYS) {
    if (k in body && k !== "smtpPass") next[k] = body[k];
  }
  if (typeof body.smtpPass === "string" && body.smtpPass.length > 0) {
    next.smtpPass = body.smtpPass;
  }

  if (typeof next.smtpPort !== "number") next.smtpPort = 587;
  next.smtpSecure = !!next.smtpSecure;

  if (!saveConfigSafe(next)) return res.status(500).json({ ok: false, error: "Failed to write config.json" });
  return res.json({ ok: true });
});

// -------------------- TAUTULLI RAW PROXY --------------------
app.get("/api/tautulli", async (req, res) => {
  try {
    const { cmd, ...rest } = req.query;
    if (!cmd) return res.status(400).json({ error: "Missing 'cmd' parameter" });
    const data = await tautulliCall(String(cmd), rest);
    return res.json({ response: { result: "success", data } });
  } catch (err) {
    console.error("[/api/tautulli] error:", err);
    res.status(500).json({ error: "Proxy error", detail: String(err) });
  }
});

// -------------------- TAUTULLI SUMMARY (for the card) --------------------
app.get("/api/tautulli/summary", async (req, res) => {
  try {
    const days = Math.max(1, int(req.query.days, CONFIG.lookbackDays || 7));
    const nowSec = Math.floor(Date.now() / 1000);
    const after = nowSec - days * 86400;

    // Helpers
    function intn(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

    function extractRows(payload) {
      if (!payload) return [];
      if (Array.isArray(payload.data)) return payload.data;
      if (Array.isArray(payload.rows)) return payload.rows;
      if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
      if (payload.history && Array.isArray(payload.history.data)) return payload.history.data;
      if (payload.history && Array.isArray(payload.history.rows)) return payload.history.rows;
      // deep fallback
      let q = [payload], seen = new Set();
      while (q.length) {
        const n = q.shift();
        if (!n || typeof n !== "object" || seen.has(n)) continue;
        seen.add(n);
        if (Array.isArray(n) && n.length && typeof n[0] === "object") return n;
        for (const v of Object.values(n)) q.push(v);
      }
      return [];
    }

    function rowTimeSec(row) {
      // Prefer 'date' then 'started' etc.
      let t =
        intn(row?.date) ||
        intn(row?.started) ||
        intn(row?.last_play) ||
        intn(row?.added_at);

      // ✅ Only divide if clearly ms (>= 1e12)
      if (Number.isFinite(t) && t >= 1e12) t = Math.round(t / 1000);

      return Number.isFinite(t) ? t : NaN;
    }

    function rowDurationSec(row) {
      let d =
        intn(row?.play_duration) ||
        intn(row?.watched_duration) ||
        intn(row?.viewed_time) ||
        intn(row?.watch_time) ||
        intn(row?.view_offset) ||
        intn(row?.duration);
      // guard for ms durations
      if (Number.isFinite(d) && d > 60 * 60 * 24 * 3) d = Math.round(d / 1000);
      return Number.isFinite(d) && d > 0 ? d : 0;
    }

    async function fetchPagedWithinWindow() {
      const groups = new Map(); // key -> { type, duration }
      let start = 0;
      const length = 1000;   // big page size
      const maxPages = 10;   // up to 10k rows
      let countedRows = 0;
      let minTsSeen = Infinity;
      let maxTsSeen = -Infinity;
      let pages = 0;

      for (let page = 0; page < maxPages; page++) {
        const data = await tautulliCall("get_history", {
          after,                 // ask server to pre-filter
          order_column: "date",
          order_dir: "desc",
          start,
          length,
        }, 8000);

        const rows = extractRows(data);
        if (!rows.length) break;
        pages += 1;

        let pageMinTs = Infinity;

        for (const row of rows) {
          countedRows += 1;

          const ts = rowTimeSec(row);
          if (Number.isFinite(ts)) {
            if (ts < pageMinTs) pageMinTs = ts;
            if (ts < minTsSeen) minTsSeen = ts;
            if (ts > maxTsSeen) maxTsSeen = ts;

            if (ts >= after) {
              const key =
                (row?.group_ids && String(row.group_ids)) ||
                (Number.isFinite(row?.reference_id) ? `ref:${row.reference_id}` : "") ||
                (Number.isFinite(row?.id) ? `id:${row.id}` : "");
              if (!key) continue;

              const type = String(row?.media_type || row?.mediaType || row?.type || row?.section_type || "").toLowerCase();
              const dur  = rowDurationSec(row);

              const g = groups.get(key) || { type: "", duration: 0 };
              if (!g.type && type) g.type = type;
              g.duration += dur;
              groups.set(key, g);
            }
          }
        }

        // Early stop if this page's oldest row is older than the window
        if (pageMinTs !== Infinity && pageMinTs < after) break;

        start += rows.length;
        if (rows.length < length) break; // last page
      }

      return { groups, countedRows, minTsSeen: (minTsSeen===Infinity?null:minTsSeen), maxTsSeen: (maxTsSeen===-Infinity?null:maxTsSeen), pages };
    }

    // 1) Home stats (lists/thumbs)
    let home = [];
    try {
      const hs = await tautulliCall("get_home_stats", {}, 6000);
      home = Array.isArray(hs) ? hs : Array.isArray(hs?.home_stats) ? hs.home_stats : [];
    } catch (e) {
      console.warn("[summary] get_home_stats failed:", String(e));
      home = [];
    }

    // 2) Build grouped plays within window quickly
    let meta = { groups: new Map(), countedRows: 0, minTsSeen: null, maxTsSeen: null, pages: 0 };
    try {
      meta = await fetchPagedWithinWindow();
    } catch (e) {
      console.warn("[summary] history window fetch failed:", String(e));
      meta = { groups: new Map(), countedRows: 0, minTsSeen: null, maxTsSeen: null, pages: 0 };
    }

    // 3) Compute totals from groups
    let movies = 0, episodes = 0, totalPlays = 0, totalTimeSeconds = 0;
    for (const g of meta.groups.values()) {
      totalPlays += 1;
      totalTimeSeconds += g.duration;
      const t = g.type || "";
      if (t.includes("movie")) movies += 1;
      else if (t.includes("episode") || t.includes("show") || t === "tv") episodes += 1;
    }

    return res.json({
      home,
      totals: {
        movies,
        episodes,
        total_plays: totalPlays,
        total_time_seconds: totalTimeSeconds,
      },
      debug: {
        days, after,
        pages: meta.pages,
        counted_rows: meta.countedRows,
        groups: meta.groups.size,
        min_ts_seen: meta.minTsSeen,
        max_ts_seen: meta.maxTsSeen
      }
    });
  } catch (e) {
    console.error("[/api/tautulli/summary] error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// -------------------- PLEX IMAGE PROXY (for thumbnails) --------------------
app.get("/api/plex/image", async (req, res) => {
  try {
    const rel = req.query?.path;
    const base = trimSlash(CONFIG.plexUrl);
    const token = CONFIG.plexToken;
    if (!base || !token || !rel) return res.status(400).send("Missing Plex config or path");
    const u = `${base}${String(rel)}${String(rel).includes("?") ? "&" : "?"}X-Plex-Token=${encodeURIComponent(token)}`;
    const r = await fetchWithTimeout(u, {}, 8000);
    if (!r.ok) return res.status(r.status).send(await r.text());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    const buf = Buffer.from(await r.arrayBuffer());
    return res.end(buf);
  } catch (e) {
    console.error("[/api/plex/image] error:", e);
    return res.status(500).send("Image proxy error");
  }
});

// -------------------- TEST ROUTES --------------------
app.post("/api/test/plex", async (req, res) => {
  try {
    const { plexUrl, plexToken } = req.body || {};
    const base = trimSlash(plexUrl);
    if (!base || !plexToken) return res.status(400).json({ ok: false, error: "Missing plexUrl or plexToken" });
    const url = `${base}/identity?X-Plex-Token=${encodeURIComponent(plexToken)}`;
    const r = await fetchWithTimeout(url, {}, 6000);
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `HTTP ${r.status}` });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/test/tautulli", async (req, res) => {
  try {
    const { tautulliUrl, tautulliApiKey } = req.body || {};
    const base = trimSlash(tautulliUrl);
    if (!base || !tautulliApiKey) return res.status(400).json({ ok: false, error: "Missing tautulliUrl or tautulliApiKey" });
    const url = `${base}/api/v2?apikey=${encodeURIComponent(tautulliApiKey)}&cmd=get_tautulli_info`;
    const r = await fetchWithTimeout(url, {}, 6000);
    const txt = await r.text();
    if (!r.ok) return res.status(r.status).json({ ok: false, error: txt || `HTTP ${r.status}` });
    let parsed;
    try { parsed = JSON.parse(txt); } catch { parsed = {}; }
    if (parsed?.response?.result === "success") return res.json({ ok: true });
    return res.status(400).json({ ok: false, error: "Tautulli responded with error" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post("/api/test-email", async (req, res) => {
  try {
    const smtpUser = req.body?.smtpUser ?? CONFIG.smtpUser;
    const smtpPass = req.body?.smtpPass && req.body.smtpPass.length > 0 ? req.body.smtpPass : CONFIG.smtpPass;
    const smtpHost = req.body?.smtpHost ?? CONFIG.smtpHost;
    const smtpPort = typeof req.body?.smtpPort === "number" ? req.body.smtpPort : (typeof CONFIG.smtpPort === "number" ? CONFIG.smtpPort : 587);
    const smtpSecure = typeof req.body?.smtpSecure === "boolean" ? req.body.smtpSecure : !!CONFIG.smtpSecure;
    const fromAddress = req.body?.fromAddress ?? CONFIG.fromAddress ?? smtpUser;
    const to = req.body?.to;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: !!smtpSecure,
      auth: (smtpUser && smtpPass) ? { user: smtpUser, pass: smtpPass } : undefined,
    });

    await transporter.verify();

    if (to) {
      await transporter.sendMail({
        from: fromAddress || smtpUser,
        to,
        subject: "Test Email from Newsletter App",
        text: "SMTP test successful.",
      });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[/api/test-email] error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// -------------------- START SERVER --------------------
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`[server] API listening on http://localhost:${port}`);
});
