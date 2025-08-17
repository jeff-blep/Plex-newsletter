import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------- paths & helpers ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "config.json");

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

// ---------- config load/save ----------
const DEFAULT_CONFIG = readJSON(CONFIG_PATH, {
  schedule: { mode: "weekly", cron: "0 9 * * 1" }, // Mon 09:00
  include: { recentMovies: true, recentEpisodes: true, serverMetrics: false, ownerRecommendation: true },
  lookbackDays: 7,
  ownerRecommendation: { plexItemId: "", note: "" },
  recipients: [{ name: "Example Recipient", email: "you@example.com" }],
  smtp: { host: "", port: 587, mode: "starttls", user: "", pass: "", from: "" }
});

function loadConfig() { return readJSON(CONFIG_PATH, DEFAULT_CONFIG); }
function saveConfig(cfg) { writeJSON(CONFIG_PATH, cfg); }

function modeToCron(mode, customCron) {
  if (mode === "daily")  return "0 9 * * *";  // every day at 09:00
  if (mode === "weekly") return "0 9 * * 1";  // every Monday at 09:00
  return customCron || "0 9 * * 1";
}

// ---------- mailer ----------
function buildTransport({ host, port, mode, user, pass }) {
  const secure = mode === "ssl";
  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure,                // ssl (465) when true; starttls (587) when false
    auth: { user, pass },
    requireTLS: !secure
    // tls: { rejectUnauthorized: false } // uncomment only for self-signed certs you trust
  });
}

async function sendHtmlEmail({ smtp, to, subject, html, text }) {
  const transporter = buildTransport(smtp);
  await transporter.verify();
  const info = await transporter.sendMail({
    from: smtp.from,
    to,
    subject,
    text: text || undefined,
    html: html || undefined
  });
  return info;
}

// ---------- newsletter stub (replace with real builder later) ----------
function buildNewsletterHTML({ include, lookbackDays, ownerRecommendation }) {
  const parts = [];
  parts.push(`<h2>Your Weekly Plex Digest</h2>`);
  parts.push(`<p>Lookback window: last ${lookbackDays} day(s).</p>`);
  if (include.recentMovies) parts.push(`<h3>Recently Added — Movies</h3><p>(placeholder)</p>`);
  if (include.recentEpisodes) parts.push(`<h3>Recently Added — TV</h3><p>(placeholder)</p>`);
  if (include.serverMetrics) parts.push(`<h3>Server Metrics</h3><p>(placeholder)</p>`);
  if (include.ownerRecommendation) {
    parts.push(`<h3>Owner Recommendation</h3>`);
    parts.push(`<p>${ownerRecommendation?.note || "(no note)"}${ownerRecommendation?.plexItemId ? " • Item: " + ownerRecommendation.plexItemId : ""}</p>`);
  }
  parts.push(`<p style="color:#667085;font-size:12px">Generated ${new Date().toLocaleString()}</p>`);
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif">${parts.join("")}</body></html>`;
}

// ---------- job runner ----------
async function runJobOnce(reason = "manual") {
  const cfg = loadConfig();

  if (!cfg.smtp?.host || !cfg.smtp?.user || !cfg.smtp?.pass || !cfg.smtp?.from) {
    throw new Error("SMTP is not configured. Set host/user/pass/from in /config.");
  }
  if (!Array.isArray(cfg.recipients) || cfg.recipients.length === 0) {
    throw new Error("No recipients configured in /config.");
  }

  const html = buildNewsletterHTML({
    include: cfg.include || {},
    lookbackDays: cfg.lookbackDays ?? 7,
    ownerRecommendation: cfg.ownerRecommendation || {}
  });

  const subject = `Plex Weekly Digest (${new Date().toISOString().slice(0,10)})`;
  const results = [];

  for (const r of cfg.recipients) {
    try {
      const info = await sendHtmlEmail({
        smtp: cfg.smtp,
        to: r.email,
        subject,
        html,
        text: html.replace(/<[^>]+>/g, " ")
      });
      results.push({ email: r.email, ok: true, messageId: info.messageId });
    } catch (e) {
      results.push({ email: r.email, ok: false, error: String(e?.message || e) });
    }
  }

  return { ok: true, reason, sent: results };
}

// ---------- scheduler ----------
let task = null;
function reschedule() {
  try { if (task) { task.stop(); task = null; } } catch {}
  const cfg = loadConfig();
  const cronExpr = modeToCron(cfg?.schedule?.mode, cfg?.schedule?.cron);
  try {
    task = cron.schedule(cronExpr, async () => {
      try {
        console.log("[SCHEDULER] running job at", new Date().toISOString());
        const res = await runJobOnce("scheduled");
        console.log("[SCHEDULER] results:", res);
      } catch (e) {
        console.error("[SCHEDULER] job error:", e);
      }
    }, { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    console.log("[SCHEDULER] scheduled with", cronExpr);
  } catch (e) {
    console.error("[SCHEDULER] invalid cron:", cronExpr, e);
  }
}
reschedule();

// ---------- server ----------
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "http://localhost:5173" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Mask password when returning config
function maskConfig(cfg) {
  const copy = JSON.parse(JSON.stringify(cfg || {}));
  if (copy?.smtp?.pass) copy.smtp.pass = "********";
  return copy;
}

// Get current config
app.get("/config", (_req, res) => {
  const cfg = loadConfig();
  res.json({ ok: true, config: maskConfig(cfg) });
});

// Update config (partial merge)
app.post("/config", (req, res) => {
  try {
    const incoming = req.body || {};
    const current = loadConfig();

    // Merge, but allow smtp.pass to be updated if provided
    const merged = {
      ...current,
      ...incoming,
      include: { ...current.include, ...(incoming.include || {}) },
      smtp: { ...current.smtp, ...(incoming.smtp || {}) }
    };

    // Persist and reschedule
    saveConfig(merged);
    reschedule();

    res.json({ ok: true, config: maskConfig(merged) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Manual run trigger
app.post("/run", async (_req, res) => {
  try {
    const out = await runJobOnce("manual");
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Existing raw-send endpoint (used by the wizard "Send Test")
app.post("/send", async (req, res) => {
  try {
    const {
      host, port, secure, username, password,
      from, to, subject, html, text
    } = req.body || {};

    if (!host || !port || typeof secure === "undefined" || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing SMTP settings (host, port, secure, username, password)" });
    }
    if (!from || !to || !subject || (!html && !text)) {
      return res.status(400).json({ ok: false, error: "Missing email fields (from, to, subject, html|text)" });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Boolean(secure),
      auth: { user: username, pass: password },
      requireTLS: !Boolean(secure),
    });

    await transporter.verify();
    const info = await transporter.sendMail({ from, to, subject, text: text || undefined, html: html || undefined });
    res.json({ ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (e) {
    console.error("[SMTP] send error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Start
const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`SMTP sender running on http://localhost:${PORT}`);
});
