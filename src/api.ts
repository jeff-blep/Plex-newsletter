// src/api.ts
// Legacy‑compatible API shim + new helpers.
// Uses Vite proxy: all requests go to /api/* and are forwarded to http://localhost:3001.

type Json = Record<string, unknown>;

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE?.replace(/\/$/, "") || "/api";

async function GET<T = any>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} fetching ${path}`);
  return (await r.json()) as T;
}

async function POST<T = any>(path: string, body: any = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const j = await r.json();
      if (j?.error) msg = String(j.error);
      if (j?.message) msg = String(j.message);
    } catch {}
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

/** ========= Legacy-named exports expected by existing UI ========= **/

// Load server-side settings
export async function getConfig() {
  return GET("/config");
}

// Post partial settings to backend (persists to .env.local server-side)
export async function postConfig(partial: Json) {
  return POST("/config", partial);
}

// “Run now” action — keep legacy signature; forward to /send
export async function runNow(payload: Json = {}) {
  return POST("/send", payload);
}

/** ========= New helpers for explicit save routes ========= **/

export async function savePlex(payload: { plexUrl?: string; plexToken?: string }) {
  return POST("/save-plex", payload);
}

export async function saveTautulli(payload: { tautulliUrl?: string; tautulliApiKey?: string }) {
  return POST("/save-tautulli", payload);
}

/** ========= Test endpoints (production-backed) ========= **/

export const testEmail = () => POST("/test-email", {});
export const testPlex = () => GET("/test-plex");
export const testTautulli = () => GET("/test-tautulli");

/** default export for convenience */
const api = {
  getConfig,
  postConfig,
  runNow,
  savePlex,
  saveTautulli,
  testEmail,
  testPlex,
  testTautulli,
};

export default api;
