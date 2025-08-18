import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------- config helpers ---------------- */
function readConfig() {
  try {
    const p = path.join(__dirname, "..", "config", "config.json");
    return JSON.parse(fs.readFileSync(p, "utf8") || "{}");
  } catch {
    return {};
  }
}

function getTautulliCfg() {
  const c = readConfig();
  const t = c?.tautulli || {};
  return {
    url: (t.url || "").trim(),        // e.g. https://10.0.1.2:8181
    apiKey: (t.apiKey || "").trim(),
    wanHost: (t.wanHost || "").trim() // optional: e.g. kunkflix.net
  };
}

/* ---------------- curl wrapper ---------------- */
function curlJson(url) {
  return new Promise((resolve, reject) => {
    // -s silent, -L follow redirects, -k ignore TLS, timeouts for sanity
    const args = [
      "-sLk",
      "--connect-timeout", "5",
      "--max-time", "15",
      "-H", "Accept: application/json",
      "-H", "User-Agent: plex-newsletter/tautulli",
      url
    ];
    execFile("curl", args, { encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`curl failed: ${err.message}`));
      const body = stdout && stdout.trim();
      try {
        const json = JSON.parse(body);
        return resolve(json);
      } catch (e) {
        return reject(new Error(`Bad JSON from ${url} :: ${body?.slice(0,200)}`));
      }
    });
  });
}

function candidates(rawBase, wanHost) {
  const out = new Set();

  let base = rawBase || "";
  if (base && !/^https?:\/\//i.test(base)) base = "https://" + base;

  const push = (proto, host, port) => out.add(`${proto}://${host}${port ? `:${port}` : ""}`);

  try {
    if (base) {
      const u = new URL(base);
      const host = u.hostname;
      const port = u.port || "8181";
      const isHttps = u.protocol === "https:";
      push(isHttps ? "https" : "http", host, port);
      push(isHttps ? "http"  : "https", host, port);
      push("https", host, "8181");
      push("http",  host, "8181");
    }
  } catch {
    if (rawBase) {
      push("https", rawBase, "8181");
      push("http",  rawBase, "8181");
    }
  }

  if (wanHost) {
    push("https", wanHost, "8181");
    push("http",  wanHost, "8181");
  }

  return Array.from(out);
}

function apiUrl(base, cmd, q = {}) {
  const { apiKey } = getTautulliCfg();
  const u = new URL("/api/v2", base);
  u.searchParams.set("apikey", apiKey);
  u.searchParams.set("cmd", cmd);
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/* ---------------- resilient fetchers (via curl) ---------------- */
async function tryJson(urls) {
  let lastErr;
  for (const u of urls) {
    try {
      const json = await curlJson(u);
      return json;
    } catch (e) {
      lastErr = e;
      console.warn("[tautulli] curl failed:", u, "::", String(e?.message || e));
    }
  }
  throw lastErr || new Error("All candidates failed");
}

async function tStatus() {
  const { url, wanHost } = getTautulliCfg();
  if (!url) throw new Error("No tautulli.url configured");
  const bases = candidates(url, wanHost);
  const urls = bases.map(b => new URL("/status", b).toString());
  console.log("[tautulli] STATUS candidates:", urls.join("  |  "));
  return tryJson(urls);
}

async function tCall(cmd, params = {}) {
  const { url, apiKey, wanHost } = getTautulliCfg();
  if (!url || !apiKey) throw new Error("Tautulli not configured");
  const bases = candidates(url, wanHost);
  const urls = bases.map(b => apiUrl(b, cmd, params));
  console.log("[tautulli] GET candidates:", urls.join("  |  "));
  const json = await tryJson(urls);
  const resp = json?.response || json;
  if (resp?.result && resp.result !== "success") {
    throw new Error(resp?.message || "Tautulli API error");
  }
  return resp?.data ?? resp;
}

/* ---------------- router ---------------- */
export const router = express.Router();

router.get("/status", async (_req, res) => {
  try {
    const raw = await tStatus();
    res.json({ ok: true, raw });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

router.get("/home", async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const data = await tCall("get_home_stats", {
      time_range: days, stats_type: 0, stats_count: 5
    });
    // Tautulli sometimes returns array under response.data
    const home = Array.isArray(data) ? data : (data?.data ?? data?.rows ?? []);
    res.json({ ok: true, days, home });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

// alias used elsewhere in the UI
router.get("/summary", async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const data = await tCall("get_home_stats", {
      time_range: days, stats_type: 0, stats_count: 5
    });
    const home = Array.isArray(data) ? data : (data?.data ?? data?.rows ?? []);
    res.json({ ok: true, days, home });
  } catch (e) {
    res.json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
