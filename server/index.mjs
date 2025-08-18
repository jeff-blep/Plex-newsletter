// server/index.mjs
// Minimal API server for Plex Newsletter (ESM)

import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL as NodeURL } from "node:url";
import { fetch, Agent } from "undici";

// ---------- paths / config helpers ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(__dirname, "..", "config");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        {
          schedule: { mode: "weekly" },
          include: {
            recentMovies: true,
            recentEpisodes: true,
            serverMetrics: false,
            ownerRecommendation: true,
          },
          lookbackDays: 7,
          ownerRecommendation: { plexItemId: "", note: "" },
          recipients: [{ name: "Example Recipient", email: "you@example.com" }],
          smtp: { host: "", port: 587, mode: "starttls", user: "", pass: "", from: "" },
          tautulli: { url: "", apiKey: "" },
          plex: { url: "", token: "", webBase: "", machineIdentifier: "", insecureTLS: true }, // 👈 allow LAN certs
        },
        null,
        2
      )
    );
  }
}

function readConfigRaw() {
  ensureConfigDir();
  try {
    const txt = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function writeConfigRaw(cfg) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function deepMerge(base, partial) {
  if (Array.isArray(partial)) return partial.slice();
  if (partial && typeof partial === "object") {
    const out = { ...(base || {}) };
    for (const k of Object.keys(partial)) {
      out[k] = deepMerge(base?.[k], partial[k]);
    }
    return out;
  }
  return partial;
}

function getConfig(maskSensitive = true) {
  const cfg = readConfigRaw();
  if (maskSensitive) {
    const m = JSON.parse(JSON.stringify(cfg));
    if (m?.smtp?.pass) m.smtp.pass = "********";
    return m;
  }
  return cfg;
}

function saveConfig(partial) {
  const current = readConfigRaw();
  const next = deepMerge(current, partial || {});
  writeConfigRaw(next);
  return getConfig(true);
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "http://localhost:5173" }));

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// config get
app.get("/config", (_req, res) => {
  res.json({ ok: true, config: getConfig(true) });
});

// config post (partial update)
app.post("/config", (req, res) => {
  try {
    const updated = saveConfig(req.body || {});
    res.json({ ok: true, config: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e?.message || String(e) });
  }
});

// (stub) run now
app.post("/run", (req, res) => {
  const cfg = getConfig(false);
  if (!cfg?.smtp?.host || !cfg?.smtp?.user || !cfg?.smtp?.pass || !cfg?.smtp?.from) {
    return res
      .status(400)
      .json({ ok: false, error: "SMTP is not configured. Set host/user/pass/from in /config." });
  }
  res.json({ ok: true, sent: (cfg.recipients || []).map((r) => r.email) });
});

// ---------- Plex image proxy (force HTTP for LAN IPs to avoid TLS/SAN mismatch) ----------
const laxAgent = new Agent({
  connect: {
    // tolerate self-signed / mismatched SANs if we still hit HTTPS
    tls: { rejectUnauthorized: false },
  },
});

// Use: <img src="/plex/image?u=<encoded full plex image url>" />
app.get("/plex/image", async (req, res) => {
  const u = req.query.u;
  if (!u || typeof u !== "string") {
    res.status(400).send("missing u");
    return;
  }

  // helper: detect private/LAN hosts
  function isPrivateHost(host) {
    if (!host) return false;
    const h = String(host).toLowerCase();
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h.startsWith("10.")) return true;
    if (h.startsWith("192.168.")) return true;
    if (h.startsWith("172.")) {
      const n = parseInt(h.split(".")[1] || "0", 10);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  }

  let target;
  try {
    const urlObj = new NodeURL(u);

    // If user passed an https:// URL to a LAN IP/host, drop to http:// to avoid TLS SNI/cert mismatches.
    if (urlObj.protocol === "https:" && isPrivateHost(urlObj.hostname)) {
      urlObj.protocol = "http:";
    }

    target = urlObj.toString();
  } catch {
    res.status(400).send("bad url");
    return;
  }

  try {
    const isHttps = target.startsWith("https://");

    const r = await fetch(target, {
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "plex-newsletter-proxy/1.0",
      },
      redirect: "follow",
      ...(isHttps ? { dispatcher: laxAgent } : {}),
    });

    if (!r.ok) {
      res.status(r.status).send(`upstream ${r.status}`);
      return;
    }

    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    const cl = r.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Cache-Control", "public, max-age=600");

    // stream to client
    if (r.body && typeof r.body.pipe === "function") {
      r.body.pipe(res);
    } else {
      const buf = Buffer.from(await r.arrayBuffer());
      res.end(buf);
    }
  } catch (e) {
    console.error("plex/image proxy error:", e);
    res.status(502).send("bad gateway");
  }
});

// ---------- Tautulli routes ----------
import { router as tautulliRouter } from "./routes/tautulli.mjs";
app.use("/tautulli", tautulliRouter);

// ---------- start ----------
const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
