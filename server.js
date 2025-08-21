/* server.js */
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");

// Node 18+ has global fetch
// If you are on older Node, uncomment the next two lines:
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors({ origin: "*"}));
app.use(express.json());

// ---------------- Config persistence ----------------
const CONFIG_PATH = path.join(__dirname, "config.json");

const DEFAULT_CONFIG = {
  // SMTP (existing schema)
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,          // true => SMTPS (465). false => STARTTLS/None
  smtpUser: "",
  smtpPass: "",               // never returned to client
  fromAddress: "",

  // Plex / Tautulli (existing schema)
  plexUrl: "",
  plexToken: "",
  tautulliUrl: "",
  tautulliApiKey: "",

  // Last test result for status card
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

// ---------------- Helpers ----------------
/**
 * Normalize UI naming to server schema.
 * Accepts both:
 *  - smtpServer/smtpPort/smtpEncryption/smtpEmailLogin/smtpEmailPassword
 *  - smtpHost/smtpPort/smtpSecure/smtpUser/smtpPass
 */
function applyIncomingSmtp(body, cfg) {
  // Prefer existing keys if provided
  if (typeof body.smtpHost === "string") cfg.smtpHost = body.smtpHost;
  if (typeof body.smtpPort === "number") cfg.smtpPort = body.smtpPort;
  if (typeof body.smtpSecure === "boolean") cfg.smtpSecure = body.smtpSecure;
  if (typeof body.smtpUser === "string") cfg.smtpUser = body.smtpUser;
  if (typeof body.smtpPass === "string" && body.smtpPass.length > 0) cfg.smtpPass = body.smtpPass;
  if (typeof body.fromAddress === "string") cfg.fromAddress = body.fromAddress;

  // Map UI-style to existing schema, if present
  if (typeof body.smtpServer === "string") cfg.smtpHost = body.smtpServer;
  if (typeof body.smtpEmailLogin === "string") cfg.smtpUser = body.smtpEmailLogin;
  if (typeof body.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0) cfg.smtpPass = body.smtpEmailPassword;
  if (typeof body.smtpPort === "number") cfg.smtpPort = body.smtpPort;
  if (typeof body.smtpEncryption === "string") {
    // "TLS/SSL" => secure true (465), otherwise false
    cfg.smtpSecure = body.smtpEncryption.toUpperCase() === "TLS/SSL";
  }
}

function smtpTransportOptions(cfg) {
  // If secure=true, default to 465. Otherwise use given port (commonly 587 for STARTTLS or 25 for None).
  const secure = !!cfg.smtpSecure;
  return {
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || (secure ? 465 : 587),
    secure,
    requireTLS: !secure && cfg.smtpPort === 587, // gentle hint for STARTTLS when using 587
    ignoreTLS: !secure && cfg.smtpPort === 25,   // for plain 25
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  };
}

// ---------------- Routes ----------------

// Get config (omit smtpPass)
app.get("/api/config", (_req, res) => {
  const { smtpPass, ...rest } = CONFIG;
  res.json(rest);
});

// Save config (accept both naming schemes)
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

// Status for Settings card
app.get("/api/status", (_req, res) => {
  const s = CONFIG.lastTest || {};
  res.json({
    emailOk: s.smtp === "ok",
    plexOk: s.plex === "ok",
    tautulliOk: s.tautulli === "ok",
  });
});

// ---------- TEST: Plex ----------
// Frontend is calling /api/test/plex (POST)
app.post("/api/test/plex", async (req, res) => {
  const plexUrl = (req.body && req.body.plexUrl) || CONFIG.plexUrl;
  const plexToken = (req.body && req.body.plexToken) || CONFIG.plexToken;

  try {
    if (!plexUrl || !plexToken) throw new Error("Missing plexUrl or plexToken");

    // Call Plex root with token appended as query
    const sep = plexUrl.includes("?") ? "&" : "?";
    const probe = `${plexUrl}${sep}X-Plex-Token=${encodeURIComponent(plexToken)}`;

    const r = await fetch(probe, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    CONFIG.lastTest.plex = "ok";
    saveConfig(CONFIG);
    res.json({ ok: true });
  } catch (e) {
    CONFIG.lastTest.plex = "fail";
    saveConfig(CONFIG);
    res.json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Back-compat (if something still calls dashed route)
app.post("/api/test-plex", (req, res) => app._router.handle(
  { ...req, url: "/api/test/plex", method: "POST" }, res, () => {}
));

// ---------- TEST: Tautulli ----------
// Frontend is calling /api/test/tautulli (POST)
app.post("/api/test/tautulli", async (req, res) => {
  const tUrl = (req.body && req.body.tautulliUrl) || CONFIG.tautulliUrl;
  const apiKey = (req.body && req.body.tautulliApiKey) || CONFIG.tautulliApiKey;

  try {
    if (!tUrl || !apiKey) throw new Error("Missing tautulliUrl or tautulliApiKey");

    const base = `${tUrl}`.replace(/\/+$/, "");
    const probe = `${base}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_activity`;

    const r = await fetch(probe, { method: "GET" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json().catch(() => ({}));
    const ok = json && json.response && json.response.result === "success";

    if (!ok) throw new Error("Unexpected response from Tautulli");

    // Optional: extract stream count
    const streams =
      json?.response?.data?.sessions && Array.isArray(json.response.data.sessions)
        ? json.response.data.sessions.length
        : undefined;

    CONFIG.lastTest.tautulli = "ok";
    saveConfig(CONFIG);
    res.json({ ok: true, streamCount: streams });
  } catch (e) {
    CONFIG.lastTest.tautulli = "fail";
    saveConfig(CONFIG);
    res.json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Back-compat dashed route
app.post("/api/test-tautulli", (req, res) => app._router.handle(
  { ...req, url: "/api/test/tautulli", method: "POST" }, res, () => {}
));

// ---------- TEST: SMTP ----------
// Your UI is already calling /api/test-email (keep it), and we alias /api/test/smtp.

app.post("/api/test-email", async (req, res) => {
  // Merge overrides from body into a copy of CONFIG
  const merged = { ...CONFIG };
  applyIncomingSmtp(req.body || {}, merged);

  try {
    if (!merged.smtpHost || !merged.smtpPort) throw new Error("Missing SMTP server/port");
    if (!merged.fromAddress) throw new Error("Missing From Address");

    const transport = nodemailer.createTransport(smtpTransportOptions(merged));

    // Verify connection/auth
    await transport.verify();

    // If a recipient is provided, send a test email
    if (req.body && typeof req.body.to === "string" && req.body.to.length > 0) {
      await transport.sendMail({
        from: merged.fromAddress,
        to: req.body.to,
        subject: "Kunkflix Newsletter SMTP Test",
        text: "This is a test email confirming your SMTP settings are working.",
      });
    }

    // Persist SMTP changes if they were provided
    applyIncomingSmtp(req.body || {}, CONFIG);
    CONFIG.lastTest.smtp = "ok";
    saveConfig(CONFIG);

    res.json({ ok: true });
  } catch (e) {
    CONFIG.lastTest.smtp = "fail";
    saveConfig(CONFIG);
    res.json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

// Alias to support /api/test/smtp from the UI if needed
app.post("/api/test/smtp", (req, res) => app._router.handle(
  { ...req, url: "/api/test-email", method: "POST" }, res, () => {}
));

// ---------------- Start ----------------
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
