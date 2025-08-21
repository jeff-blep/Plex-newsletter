/* server/index.mjs */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

// Node 18+ ships global fetch

// ---- ESM dirname helpers ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config file ----
const CONFIG_PATH = path.join(__dirname, "config.json");

// ---- Default config (matches your live schema) ----
const DEFAULT_CONFIG = {
  // SMTP
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false, // true => SMTPS(465); false => STARTTLS/None
  smtpUser: "",
  smtpPass: "",      // never returned to client
  fromAddress: "",

  // Plex / Tautulli
  plexUrl: "",
  plexToken: "",
  tautulliUrl: "",
  tautulliApiKey: "",

  // Status for settings card
  lastTest: { plex: "unknown", tautulli: "unknown", smtp: "unknown" },
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      lastTest: { ...DEFAULT_CONFIG.lastTest, ...(parsed.lastTest || {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

let CONFIG = loadConfig();

// ---- Helpers ----
/** Accept both your schema and UI-style schema, store in your schema */
function applyIncomingSmtp(body, cfg) {
  // Your native keys
  if (typeof body.smtpHost === "string") cfg.smtpHost = body.smtpHost;
  if (typeof body.smtpPort === "number") cfg.smtpPort = body.smtpPort;
  if (typeof body.smtpSecure === "boolean") cfg.smtpSecure = body.smtpSecure;
  if (typeof body.smtpUser === "string") cfg.smtpUser = body.smtpUser;
  if (typeof body.smtpPass === "string" && body.smtpPass.length > 0) cfg.smtpPass = body.smtpPass;
  if (typeof body.fromAddress === "string") cfg.fromAddress = body.fromAddress;

  // UI-style mapping
  if (typeof body.smtpServer === "string") cfg.smtpHost = body.smtpServer;
  if (typeof body.smtpPort === "number") cfg.smtpPort = body.smtpPort;
  if (typeof body.smtpEmailLogin === "string") cfg.smtpUser = body.smtpEmailLogin;
  if (typeof body.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0)
    cfg.smtpPass = body.smtpEmailPassword;
  if (typeof body.smtpEncryption === "string")
    cfg.smtpSecure = body.smtpEncryption.toUpperCase() === "TLS/SSL"; // TLS/SSL => secure=true
}

function smtpTransportOptions(cfg) {
  const secure = !!cfg.smtpSecure;
  return {
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || (secure ? 465 : 587),
    secure,
    requireTLS: !secure && Number(cfg.smtpPort) === 587, // STARTTLS hint
    ignoreTLS: !secure && Number(cfg.smtpPort) === 25,   // plain 25
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  };
}

// ---- App ----
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// ---- Routes ----

// GET config (omit password)
app.get("/api/config", (_req, res) => {
  const { smtpPass, ...rest } = CONFIG;
  res.json(rest);
});

// POST config (merge + persist)
app.post("/api/config", (req, res) => {
  const b = req.body || {};

  // Plex
  if (typeof b.plexUrl === "string") CONFIG.plexUrl = b.plexUrl;
  if (typeof b.plexToken === "string") CONFIG.plexToken = b.plexToken;

  // Tautulli
  if (typeof b.tautulliUrl === "string") CONFIG.tautulliUrl = b.tautulliUrl;
  if (typeof b.tautulliApiKey === "string") CONFIG.tautulliApiKey = b.tautulliApiKey;

  // SMTP
  applyIncomingSmtp(b, CONFIG);

  saveConfig(CONFIG);
  res.json({ ok: true });
});

// Status for settings card
app.get("/api/status", (_req, res) => {
  const s = CONFIG.lastTest || {};
  res.json({
    emailOk: s.smtp === "ok",
    plexOk: s.plex === "ok",
    tautulliOk: s.tautulli === "ok",
  });
});

// ---- TEST: Plex (with timeout & clear errors) ----
app.post("/api/test/plex", async (req, res) => {
  const plexUrl = (req.body && req.body.plexUrl) || CONFIG.plexUrl;
  const plexToken = (req.body && req.body.plexToken) || CONFIG.plexToken;

  try {
    if (!plexUrl || !plexToken) throw new Error("Missing plexUrl or plexToken");

    const urlWithScheme = /^https?:\/\//i.test(plexUrl) ? plexUrl : `http://${plexUrl}`;
    const sep = urlWithScheme.includes("?") ? "&" : "?";
    const probe = `${urlWithScheme}${sep}X-Plex-Token=${encodeURIComponent(plexToken)}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    let r;
    try {
      r = await fetch(probe, { method: "GET", signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${r.statusText}${text ? ` — ${text.slice(0,180)}` : ""}`);
    }

    CONFIG.lastTest.plex = "ok";
    saveConfig(CONFIG);
    res.json({ ok: true });
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Timeout reaching Plex (5s)" : (e?.message || String(e));
    CONFIG.lastTest.plex = "fail";
    saveConfig(CONFIG);
    res.json({ ok: false, error: msg });
  }
});

// Back‑compat alias
app.post("/api/test-plex", (req, res) =>
  app._router.handle({ ...req, url: "/api/test/plex", method: "POST" }, res, () => {})
);

// ---- TEST: Tautulli (with timeout & clear errors) ----
app.post("/api/test/tautulli", async (req, res) => {
  const tUrlRaw = (req.body && req.body.tautulliUrl) || CONFIG.tautulliUrl;
  const apiKey   = (req.body && req.body.tautulliApiKey) || CONFIG.tautulliApiKey;

  try {
    if (!tUrlRaw || !apiKey) throw new Error("Missing tautulliUrl or tautulliApiKey");

    const tUrl = /^https?:\/\//i.test(tUrlRaw) ? tUrlRaw : `http://${tUrlRaw}`;
    const base = `${tUrl}`.replace(/\/+$/, "");
    const probe = `${base}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_activity`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    let r;
    try {
      r = await fetch(probe, { method: "GET", signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${r.statusText}${text ? ` — ${text.slice(0,180)}` : ""}`);
    }

    const json = await r.json().catch(() => null);
    const ok = json && json.response && json.response.result === "success";
    if (!ok) throw new Error("Unexpected response from Tautulli (no success flag)");

    const streams =
      json?.response?.data?.sessions && Array.isArray(json.response.data.sessions)
        ? json.response.data.sessions.length
        : undefined;

    CONFIG.lastTest.tautulli = "ok";
    saveConfig(CONFIG);
    res.json({ ok: true, streamCount: streams });
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Timeout reaching Tautulli (5s)" : (e?.message || String(e));
    CONFIG.lastTest.tautulli = "fail";
    saveConfig(CONFIG);
    res.json({ ok: false, error: msg });
  }
});

// Back‑compat alias
app.post("/api/test-tautulli", (req, res) =>
  app._router.handle({ ...req, url: "/api/test/tautulli", method: "POST" }, res, () => {})
);

// ---- TEST: SMTP ----
app.post("/api/test-email", async (req, res) => {
  const merged = { ...CONFIG };
  applyIncomingSmtp(req.body || {}, merged);

  try {
    if (!merged.smtpHost || !merged.smtpPort) throw new Error("Missing SMTP server/port");
    if (!merged.fromAddress) throw new Error("Missing From Address");

    const transport = nodemailer.createTransport(smtpTransportOptions(merged));

    await transport.verify();

    if (req.body && typeof req.body.to === "string" && req.body.to.length > 0) {
      await transport.sendMail({
        from: merged.fromAddress,
        to: req.body.to,
        subject: "Kunkflix Newsletter SMTP Test",
        text: "This is a test email confirming your SMTP settings are working.",
      });
    }

    // Persist any SMTP updates (including new smtpPass if provided)
    applyIncomingSmtp(req.body || {}, CONFIG);
    CONFIG.lastTest.smtp = "ok";
    saveConfig(CONFIG);

    res.json({ ok: true });
  } catch (e) {
    CONFIG.lastTest.smtp = "fail";
    saveConfig(CONFIG);
    res.json({ ok: false, error: e?.message || String(e) });
  }
});

// Alias: /api/test/smtp -> /api/test-email
app.post("/api/test/smtp", (req, res) =>
  app._router.handle({ ...req, url: "/api/test-email", method: "POST" }, res, () => {})
);

// ---- Start ----
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
