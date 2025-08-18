// server/index.mjs
import express from "express";
import cors from "cors";
import { readFile, writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { Agent } from "undici";

// ---------- paths & config helpers ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(__dirname, "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

async function readJson(file, fallback = {}) {
  try {
    const buf = await readFile(file);
    return JSON.parse(String(buf));
  } catch {
    return fallback;
  }
}
async function writeJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(obj, null, 2));
}
async function getConfig() {
  return readJson(CONFIG_FILE, {});
}
async function mergeConfig(partial) {
  const cur = await getConfig();
  const next = deepMerge(cur, partial || {});
  await writeJson(CONFIG_FILE, next);
  return next;
}
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return b.slice();
  if (isObj(a) && isObj(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }

// ---------- express ----------
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "http://localhost:5173" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// config endpoints
app.get("/config", async (_req, res) => {
  res.json({ ok: true, config: await getConfig() });
});
app.post("/config", async (req, res) => {
  try {
    const updated = await mergeConfig(req.body || {});
    res.json({ ok: true, config: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------- import tautulli router (works for either default or named export) ----------
import * as taut from "./routes/tautulli.mjs";
const tautulliRouter = taut.default || taut.router;
if (tautulliRouter) {
  app.use("/tautulli", tautulliRouter);
} else {
  console.warn("[warn] ./routes/tautulli.mjs did not export a router; /tautulli routes disabled");
}

// ---------- Plex helpers ----------
function getPlexBaseAndToken(cfg) {
  const base = cfg?.plex?.url || "";
  const token = cfg?.plex?.token || "";
  return { base: base.replace(/\/+$/, ""), token };
}

const insecureAgent = new Agent({
  connect: { tls: { rejectUnauthorized: false } }
});

// Build a URL from base + path and tack on X-Plex-Token if present
function buildPlexUrl(base, pathLike, token) {
  const p = pathLike.startsWith("/") ? pathLike : `/${pathLike}`;
  const url = new URL(base + p);
  if (token) url.searchParams.set("X-Plex-Token", token);
  return url;
}

// ---------- Plex image proxy ----------
// Use: /plex/image?u=<full-plex-url>  OR  /plex/image?path=/library/metadata/..../thumb/...
app.get("/plex/image", async (req, res) => {
  try {
    const cfg = await getConfig();
    const { base, token } = getPlexBaseAndToken(cfg);

    let targetUrl;
    if (typeof req.query.u === "string" && req.query.u) {
      targetUrl = new URL(req.query.u);
    } else if (typeof req.query.path === "string" && req.query.path) {
      if (!base) return res.status(400).send("Missing Plex base URL");
      targetUrl = buildPlexUrl(base, req.query.path, token);
    } else {
      return res.status(400).send("Missing ?u= or ?path=");
    }

    const dispatcher = targetUrl.protocol === "https:" ? insecureAgent : undefined;
    const r = await fetch(targetUrl.toString(), {
      dispatcher,
      headers: { Accept: "image/*,*/*;q=0.8", "User-Agent": "plex-newsletter/1.0" },
      redirect: "follow",
    });

    if (!r.ok) {
      res.status(r.status);
    }
    const ct = r.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", ct);
    const cl = r.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");

    if (r.body) {
      // Node 18+ fetch streams are web streams; pipe to res
      for await (const chunk of r.body) res.write(chunk);
      res.end();
    } else {
      res.end();
    }
  } catch (e) {
    console.error("plex/image error:", e);
    res.status(502).send("Bad Gateway");
  }
});

// ---------- Plex search (enriched) ----------
async function plexFetchJson(cfg, p) {
  const { base, token } = getPlexBaseAndToken(cfg);
  if (!base) throw new Error("Plex not configured");
  const url = new URL(base + p);
  if (token) url.searchParams.set("X-Plex-Token", token);

  const dispatcher = url.protocol === "https:" ? insecureAgent : undefined;
  const r = await fetch(url.toString(), {
    dispatcher,
    headers: {
      Accept: "application/json",
      "X-Plex-Product": "Plex Newsletter",
      "X-Plex-Version": "1.0",
    }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function mapMetadata(m) {
  // normalize a few keys we care about
  const base = {
    ratingKey: m.ratingKey,
    title: m.title,
    year: m.year,
    type: m.type, // movie, show, episode
    thumb: m.thumb, // /library/metadata/.../thumb/...
    art: m.art,
  };
  if (m.type === "episode") {
    return {
      ...base,
      showTitle: m.grandparentTitle || m.parentTitle,
      episodeTitle: m.title,
      seasonIndex: m.parentIndex,
      episodeIndex: m.index,
      grandparentThumb: m.grandparentThumb,
    };
  }
  return base;
}

app.get("/plex/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ ok: true, count: 0, results: [] });

    const cfg = await getConfig();
    const type = String(req.query.type || "").toLowerCase(); // "movie" | "show" | "episode" | ""
    const hubs = await plexFetchJson(cfg, `/hubs/search?query=${encodeURIComponent(q)}&limit=20`);
    const all = (hubs?.MediaContainer?.Hub || [])
      .filter(h => !type || h?.type === type)
      .flatMap(h => Array.isArray(h?.Metadata) ? h.Metadata : []);
    const results = all.map(mapMetadata);

    res.json({ ok: true, count: results.length, results });
  } catch (e) {
    console.error("plex search error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Alias enriched path (frontend may call this)
app.get("/plex/search_enriched", async (req, res) => {
  req.url = req.url.replace("/plex/search_enriched", "/plex/search");
  app._router.handle(req, res);
});

// ---------- start ----------
const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
