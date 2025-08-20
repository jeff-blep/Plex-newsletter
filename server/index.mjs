// server/index.mjs
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --------------------------------------------------
// Paths
// --------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL_PATH = path.join(PROJECT_ROOT, '.env.local');

// --------------------------------------------------
// Small utils
// --------------------------------------------------
const coerceString = (v, fb = '') => (typeof v === 'string' ? v : v == null ? fb : String(v));
const coerceBool = (v, fb = false) => (typeof v === 'boolean' ? v : String(v) === 'true');
const coerceNumber = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fb;
};
const safeEmail = (v, fb = 'noreply@example.com') => {
  const s = coerceString(v, '').trim();
  return /.+@.+\..+/.test(s) ? s : fb;
};
const safeUrl = (v, fb = '') => {
  const s = coerceString(v, '').trim();
  if (!s) return fb;
  try { new URL(s); return s; } catch { return fb; }
};

function buildTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: Number(cfg.smtpPort) || 587,
    secure: !!cfg.smtpSecure,
    auth: cfg.smtpUser || cfg.smtpPass ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
}

// --------------------------------------------------
// .env.local persistence helpers
// --------------------------------------------------
async function readEnvFile(filePath) {
  try {
    const txt = await fs.readFile(filePath, 'utf8');
    return txt.split(/\r?\n/);
  } catch {
    return []; // treat as empty
  }
}

/**
 * Upserts provided key/values into .env.local.
 * - Preserves other lines (including comments and blank lines)
 * - Updates existing keys if found; appends new ones at the end
 */
async function upsertEnv(updates) {
  const lines = await readEnvFile(ENV_LOCAL_PATH);

  const isKeyLine = (line) => /^[A-Z0-9_]+\s*=/.test(line);
  const parseKey = (line) => (line.split('=')[0] || '').trim();

  // Track which keys we've updated
  const updated = new Set();

  const out = lines.map((line) => {
    if (!isKeyLine(line)) return line;
    const key = parseKey(line);
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      updated.add(key);
      const val = String(updates[key] ?? '').replace(/\r?\n/g, '\\n');
      return `${key}=${val}`;
    }
    return line;
  });

  // Append any keys that weren't present
  for (const [key, rawVal] of Object.entries(updates)) {
    if (updated.has(key)) continue;
    const val = String(rawVal ?? '').replace(/\r?\n/g, '\\n');
    out.push(`${key}=${val}`);
  }

  // Write atomically
  const tmp = `${ENV_LOCAL_PATH}.tmp`;
  const finalText = out.join('\n') + '\n';
  await fs.writeFile(tmp, finalText, 'utf8');
  await fs.rename(tmp, ENV_LOCAL_PATH);
}

// --------------------------------------------------
// In-memory config (seeded from env)
// --------------------------------------------------
let appConfig = {
  // SMTP
  smtpHost: coerceString(process.env.SMTP_HOST, 'smtp.gmail.com'),
  smtpPort: coerceNumber(process.env.SMTP_PORT, 587),
  smtpSecure: coerceBool(process.env.SMTP_SECURE, false),
  smtpUser: coerceString(process.env.SMTP_USER, ''),
  smtpPass: coerceString(process.env.SMTP_PASS, ''),
  fromAddress: safeEmail(process.env.FROM_EMAIL, 'noreply@example.com'),

  // Plex
  plexUrl: safeUrl(process.env.PLEX_URL, ''),
  plexToken: coerceString(process.env.PLEX_TOKEN, ''),

  // Tautulli
  tautulliUrl: safeUrl(process.env.TAUTULLI_URL, ''),
  tautulliApiKey: coerceString(process.env.TAUTULLI_API_KEY, ''),
};

// --------------------------------------------------
// App
// --------------------------------------------------
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Health
app.get('/', (_req, res) => res.json({ ok: true }));

// ---------------- Config API ----------------
app.get('/api/config', (_req, res) => {
  const payload = {
    smtpHost: coerceString(appConfig.smtpHost, ''),
    smtpPort: coerceNumber(appConfig.smtpPort, 587),
    smtpSecure: !!appConfig.smtpSecure,
    smtpUser: coerceString(appConfig.smtpUser, ''),
    fromAddress: safeEmail(appConfig.fromAddress, 'noreply@example.com'),

    plexUrl: safeUrl(appConfig.plexUrl, ''),
    plexToken: coerceString(appConfig.plexToken, ''),

    tautulliUrl: safeUrl(appConfig.tautulliUrl, ''),
    tautulliApiKey: coerceString(appConfig.tautulliApiKey, ''),

    smtpPass: '', // never disclose
  };
  res.json(payload);
});

app.post('/api/config', async (req, res) => {
  const {
    smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromAddress,
    plexUrl, plexToken,
    tautulliUrl, tautulliApiKey,
  } = req.body ?? {};

  // Update in-memory
  if (typeof smtpHost !== 'undefined') appConfig.smtpHost = coerceString(smtpHost);
  if (typeof smtpPort !== 'undefined') appConfig.smtpPort = coerceNumber(smtpPort, 587);
  if (typeof smtpSecure !== 'undefined') appConfig.smtpSecure = coerceBool(smtpSecure);
  if (typeof smtpUser !== 'undefined') appConfig.smtpUser = coerceString(smtpUser);
  if (typeof smtpPass !== 'undefined' && smtpPass !== '') appConfig.smtpPass = coerceString(smtpPass);
  if (typeof fromAddress !== 'undefined') appConfig.fromAddress = safeEmail(fromAddress, 'noreply@example.com');

  if (typeof plexUrl !== 'undefined') appConfig.plexUrl = safeUrl(plexUrl, '');
  if (typeof plexToken !== 'undefined') appConfig.plexToken = coerceString(plexToken);

  if (typeof tautulliUrl !== 'undefined') appConfig.tautulliUrl = safeUrl(tautulliUrl, '');
  if (typeof tautulliApiKey !== 'undefined') appConfig.tautulliApiKey = coerceString(tautulliApiKey);

  // Persist to .env.local (only the keys we manage)
  const persist = {};
  if (typeof smtpHost !== 'undefined') persist.SMTP_HOST = appConfig.smtpHost;
  if (typeof smtpPort !== 'undefined') persist.SMTP_PORT = String(appConfig.smtpPort);
  if (typeof smtpSecure !== 'undefined') persist.SMTP_SECURE = String(!!appConfig.smtpSecure);
  if (typeof smtpUser !== 'undefined') persist.SMTP_USER = appConfig.smtpUser;
  if (typeof smtpPass !== 'undefined' && smtpPass !== '') persist.SMTP_PASS = appConfig.smtpPass;
  if (typeof fromAddress !== 'undefined') persist.FROM_EMAIL = appConfig.fromAddress;

  if (typeof plexUrl !== 'undefined') persist.PLEX_URL = appConfig.plexUrl;
  if (typeof plexToken !== 'undefined') persist.PLEX_TOKEN = appConfig.plexToken;

  if (typeof tautulliUrl !== 'undefined') persist.TAUTULLI_URL = appConfig.tautulliUrl;
  if (typeof tautulliApiKey !== 'undefined') persist.TAUTULLI_API_KEY = appConfig.tautulliApiKey;

  try {
    if (Object.keys(persist).length) await upsertEnv(persist);
    res.json({ ok: true, message: 'Config updated & persisted' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Failed to persist .env.local' });
  }
});

// ---------------- Convenience save routes (aliases) ----------------
app.post('/api/save-plex', async (req, res) => {
  const { plexUrl, plexToken } = req.body ?? {};
  if (typeof plexUrl !== 'undefined') appConfig.plexUrl = safeUrl(plexUrl, '');
  if (typeof plexToken !== 'undefined') appConfig.plexToken = coerceString(plexToken);

  try {
    await upsertEnv({
      ...(typeof plexUrl !== 'undefined' ? { PLEX_URL: appConfig.plexUrl } : {}),
      ...(typeof plexToken !== 'undefined' ? { PLEX_TOKEN: appConfig.plexToken } : {}),
    });
    res.json({ ok: true, message: 'Plex settings saved' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Failed to persist Plex settings' });
  }
});

app.post('/api/save-tautulli', async (req, res) => {
  const { tautulliUrl, tautulliApiKey } = req.body ?? {};
  if (typeof tautulliUrl !== 'undefined') appConfig.tautulliUrl = safeUrl(tautulliUrl, '');
  if (typeof tautulliApiKey !== 'undefined') appConfig.tautulliApiKey = coerceString(tautulliApiKey);

  try {
    await upsertEnv({
      ...(typeof tautulliUrl !== 'undefined' ? { TAUTULLI_URL: appConfig.tautulliUrl } : {}),
      ...(typeof tautulliApiKey !== 'undefined' ? { TAUTULLI_API_KEY: appConfig.tautulliApiKey } : {}),
    });
    res.json({ ok: true, message: 'Tautulli settings saved' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Failed to persist Tautulli settings' });
  }
});

// ---------------- Email test + send ----------------
app.post('/api/test-email', async (_req, res) => {
  try {
    const transporter = buildTransporter(appConfig);
    const to = appConfig.fromAddress || appConfig.smtpUser;
    if (!to) return res.status(400).json({ ok: false, error: 'No fromAddress/smtpUser to send test to' });

    await transporter.sendMail({
      from: appConfig.fromAddress || appConfig.smtpUser || 'noreply@example.com',
      to,
      subject: 'Plex Newsletter SMTP Test',
      text: 'This is a test email from Kunkflix Newsletter.',
    });

    res.json({ ok: true, message: 'SMTP test email sent' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'SMTP test failed' });
  }
});

app.post('/api/send', async (req, res) => {
  const { to, subject, text, html } = req.body ?? {};
  if (!to || !subject) return res.status(400).json({ ok: false, error: 'Missing "to" or "subject"' });

  try {
    const transporter = buildTransporter(appConfig);
    await transporter.sendMail({
      from: appConfig.fromAddress || appConfig.smtpUser || 'noreply@example.com',
      to,
      subject,
      text: coerceString(text, ''),
      html: coerceString(html, ''),
    });
    res.json({ ok: true, message: 'Email sent' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'Send failed' });
  }
});

// ---------------- Plex / Tautulli tests (PROD) ----------------
app.get('/api/test-plex', async (_req, res) => {
  try {
    const url = appConfig.plexUrl;
    const token = appConfig.plexToken;
    if (!url || !token) return res.status(400).json({ ok: false, error: 'Missing plexUrl or plexToken' });

    const resp = await fetch(`${url}/?X-Plex-Token=${encodeURIComponent(token)}`, {
      method: 'GET',
      headers: { 'Accept': '*/*' },
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: `Plex HTTP ${resp.status}`, raw: text.slice(0, 200) });
    }
    res.json({ ok: true, raw: text.slice(0, 200) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'plex test failed' });
  }
});

app.get('/api/test-tautulli', async (_req, res) => {
  try {
    const base = appConfig.tautulliUrl;
    const key = appConfig.tautulliApiKey;
    if (!base || !key) return res.status(400).json({ ok: false, error: 'Missing tautulliUrl or tautulliApiKey' });

    const u = new URL('/api/v2', base);
    u.searchParams.set('apikey', key);
    u.searchParams.set('cmd', 'get_activity');

    const resp = await fetch(u, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: `Tautulli HTTP ${resp.status}`, raw: data });
    }

    const result = data?.response?.result;
    const streamCount = data?.response?.data?.stream_count ?? data?.response?.data?.streams?.length;
    if (result === 'success') {
      res.json({ ok: true, streamCount, raw: data?.response?.result || 'success' });
    } else {
      res.status(500).json({ ok: false, error: 'tautulli returned non-success', raw: data });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'tautulli test failed' });
  }
});

// ---------------- Debug ----------------
app.get('/api/_debug', (_req, res) => {
  const routes =
    app._router?.stack
      ?.filter(l => l.route && l.route.path)
      ?.map(l => ({
        method: Object.keys(l.route.methods)[0]?.toUpperCase() || 'GET',
        path: l.route.path
      })) || [];

  res.json({
    routes,
    appConfig: { ...appConfig, smtpPass: '***' },
    envFile: path.relative(PROJECT_ROOT, ENV_LOCAL_PATH),
  });
});

// ---------------- Start server ----------------
const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  console.log(`Using env file: ${path.relative(PROJECT_ROOT, ENV_LOCAL_PATH)}`);
});
