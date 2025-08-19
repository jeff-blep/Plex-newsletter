// server/routes/plex.mjs
import { Router } from "express";
import { Agent } from "undici";
import { getConfig } from "../lib/config.mjs";

const router = Router();

/** Build a full Plex URL from a relative path (or pass through absolute). */
function buildPlexUrl(pathOrUrl, cfg) {
  const base = cfg?.plex?.url || "";
  if (!base && !/^https?:\/\//i.test(pathOrUrl)) {
    throw new Error("Plex not configured (need plex.url in config/config.json).");
  }
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const ensured = String(pathOrUrl).startsWith("/") ? String(pathOrUrl) : `/${String(pathOrUrl)}`;
  return `${base.replace(/\/$/, "")}${ensured}`;
}

/** Perform a fetch to Plex, injecting token & insecure TLS as needed. */
async function plexFetch(pathOrUrl, cfg, init = {}) {
  const url = new URL(buildPlexUrl(pathOrUrl, cfg));

  // Token
  const token = cfg?.plex?.token || "";
  if (token && !url.searchParams.get("X-Plex-Token")) {
    url.searchParams.set("X-Plex-Token", token);
  }

  // Insecure TLS for self-signed / mismatched SANs
  let dispatcher;
  if (url.protocol === "https:" && cfg?.plex?.insecureTLS) {
    dispatcher = new Agent({
      connect: { tls: { rejectUnauthorized: false, servername: false } },
    });
  }

  const r = await fetch(url.toString(), {
    dispatcher,
    headers: {
      "Accept": "application/json, application/xml;q=0.9, */*;q=0.8",
      "User-Agent": "plex-newsletter/1.0",
    },
    redirect: "follow",
    ...init,
  });

  return r;
}

/** Map Plex library type string -> numeric type for /search */
const TYPE_MAP = {
  movie: "1",
  show: "2",
  // music: "10",
  // photo: "8",
};

function pickMetaFields(m) {
  return {
    title: m.title,
    year: m.year,
    type: m.type,
    ratingKey: m.ratingKey,
    guid: m.guid,
    key: m.key,              // e.g. /library/metadata/96959
    thumb: m.thumb,          // e.g. /library/metadata/96959/thumb/...
    art: m.art,
    summary: m.summary,
  };
}

/** GET /plex/status — quick sanity check against the Plex server */
router.get("/status", async (req, res) => {
  try {
    const cfg = getConfig(false) || {};
    // /identity is a tiny XML; we only care if it's reachable
    const r = await plexFetch("/identity", cfg);
    res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

/**
 * GET /plex/search?q=mission&type=movie|show
 * Returns: { ok, count, results: [{...}] }
 */
router.get("/search", async (req, res) => {
  try {
    const cfg = getConfig(false) || {};
    const q = (req.query.q || "").toString().trim();
    const typeRaw = (req.query.type || "").toString().toLowerCase();
    const type = TYPE_MAP[typeRaw] || ""; // optional; Plex will search all if omitted

    if (!q) return res.json({ ok: false, error: "Missing query ?q=" });

    const url = new URL("/search", buildPlexUrl("/", cfg));
    url.searchParams.set("query", q);
    if (type) url.searchParams.set("type", type);

    const r = await plexFetch(url.toString(), cfg);
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `Plex search failed (${r.status})` });
    }

    // Plex may return JSON (newer) or XML (older). Prefer JSON; if not JSON, try text and bail nicely.
    const contentType = r.headers.get("content-type") || "";
    if (/application\/json/i.test(contentType)) {
      const data = await r.json();
      const md = data?.MediaContainer?.Metadata || [];
      const results = md.map(pickMetaFields);
      return res.json({ ok: true, count: results.length, results });
    } else {
      // Try to parse minimal JSON fallback from text via regex (best-effort); otherwise just return raw text.
      const text = await r.text();
      // Very light XML sniffing to pull a few fields (optional)
      const results = [];
      const itemRe = /<Video\b[^>]*?ratingKey="([^"]+)"[^>]*?type="([^"]+)"[^>]*?title="([^"]+)"/g;
      let m;
      while ((m = itemRe.exec(text))) {
        results.push({ ratingKey: m[1], type: m[2], title: m[3] });
      }
      return res.json({ ok: true, count: results.length, results, mode: "xml-fallback" });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

export default router;
