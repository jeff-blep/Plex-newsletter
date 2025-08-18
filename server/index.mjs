// server/index.mjs
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getConfig } from "./lib/config.mjs";
import tautulliRouter from "./routes/tautulli.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5174;

// Basic middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: false,
  })
);
app.use(express.json());

// ---------- Utilities ----------
const CONFIG_FILE = path.join(__dirname, "config", "config.json");

async function loadConfig() {
  // Prefer lib/config.mjs.getConfig so we stay consistent with your current setup
  const cfg = await getConfig();
  return cfg || {};
}

async function persistConfig(partial) {
  // Merge with existing on-disk config.json (server/config/config.json).
  // We do NOT rely on saveConfig from lib to avoid export mismatch.
  let existing = {};
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    existing = JSON.parse(raw);
  } catch {
    // file may not exist yet—ok
    existing = {};
  }

  // Deep-ish merge (shallow per top-level keys)
  const next = { ...existing, ...partial };

  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

function stripTrailingSlash(u) {
  return String(u || "").replace(/\/$/, "");
}

// ---------- Health ----------
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ---------- Config ----------
app.get("/config", async (_req, res) => {
  try {
    const cfg = await loadConfig();
    res.json({ ok: true, config: cfg });
  } catch (err) {
    console.error("GET /config error:", err);
    res.status(500).json({ ok: false, error: "Failed to load config" });
  }
});

app.post("/config", async (req, res) => {
  try {
    const body = req.body || {};
    const saved = await persistConfig(body);
    // Re-read merged config via lib so the in-memory view aligns with the app
    const merged = await loadConfig();
    res.json({ ok: true, config: merged, saved });
  } catch (err) {
    console.error("POST /config error:", err);
    res.status(500).json({ ok: false, error: "Failed to save config" });
  }
});

// ---------- Plex: image proxy (robust, SNI-proof) ----------
app.get("/plex/image", async (req, res) => {
  try {
    const cfg = await loadConfig();
    const plex = cfg.plex || {};

    if (!plex.url) {
      res.status(400).send("Plex not configured");
      return;
    }

    // Accept ?path=/library/metadata/... (preferred) or legacy ?u=https://... (we’ll normalize)
    let pathOnly = "";
    const qPath = req.query.path;
    const qU = req.query.u;

    if (typeof qPath === "string" && qPath.length > 0) {
      pathOnly = qPath.startsWith("/") ? qPath : `/${qPath}`;
    } else if (typeof qU === "string" && qU.length > 0) {
      // Normalize any full URL to pathname+search and rebuild on our configured base
      try {
        const uObj = new URL(qU);
        pathOnly = uObj.pathname + (uObj.search || "");
      } catch {
        res.status(400).send("Invalid 'u' parameter");
        return;
      }
    } else {
      res.status(400).send("Missing 'path' or 'u' query parameter");
      return;
    }

    const base = stripTrailingSlash(plex.url);
    let upstream = `${base}${pathOnly}`;

    // Ensure X-Plex-Token is present; if not, append from config
    if (!/[?&]X-Plex-Token=/.test(upstream) && plex.token) {
      upstream += (upstream.includes("?") ? "&" : "?") + `X-Plex-Token=${encodeURIComponent(plex.token)}`;
    }

    // Fetch bytes and return. Use arrayBuffer to avoid stream variations.
    const r = await fetch(upstream);
    if (!r.ok) {
      console.error("plex/image upstream not ok:", r.status, upstream);
      res.status(502).send("Bad Gateway");
      return;
    }

    const ct = r.headers.get("content-type") || "image/jpeg";
    res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    res.setHeader("Content-Type", ct);

    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error("plex/image proxy error:", err);
    res.status(502).send("Bad Gateway");
  }
});

// ---------- Plex: search ----------
app.get("/plex/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const type = String(req.query.type || "").trim(); // "movie" | "show" (optional)
    if (!q) {
      res.status(400).json({ ok: false, error: "Missing q" });
      return;
    }

    const cfg = await loadConfig();
    const plex = cfg.plex || {};
    if (!plex.url || !plex.token) {
      res
        .status(400)
        .json({ ok: false, error: "Plex not configured (need plex.url and plex.token in server/config/config.json)." });
      return;
    }

    const base = stripTrailingSlash(plex.url);

    // Decide searchTypes
    let searchTypes = ""; // empty -> Plex returns all hubs
    if (type === "movie") searchTypes = "movies";
    else if (type === "show" || type === "series") searchTypes = "tv";

    const url = new URL(`${base}/hubs/search`);
    url.searchParams.set("query", q);
    if (searchTypes) url.searchParams.set("searchTypes", searchTypes);
    url.searchParams.set("X-Plex-Token", plex.token);

    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!r.ok) {
      res.status(502).json({ ok: false, error: `Plex upstream error ${r.status}` });
      return;
    }

    const data = await r.json().catch(() => ({}));
    // Normalize items (Plex returns hubs[].Metadata[]).
    const hubs = Array.isArray(data?.MediaContainer?.Hub) ? data.MediaContainer.Hub : [];
    const results = [];
    for (const hub of hubs) {
      const items = Array.isArray(hub?.Metadata) ? hub.Metadata : [];
      for (const it of items) {
        results.push({
          title: it.title,
          type: it.type,
          ratingKey: it.ratingKey,
          thumb: it.thumb, // relative path like /library/metadata/xxx/thumb/...
          year: it.year,
          summary: it.summary,
        });
      }
    }

    res.json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error("plex search error:", err);
    res.status(500).json({ ok: false, error: "Search failed" });
  }
});

// ---------- Tautulli ----------
app.use("/tautulli", tautulliRouter);

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
