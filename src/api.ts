// src/api.ts

type SMTPEnc = "TLS/SSL" | "STARTTLS" | "None";

// Point straight at the API in dev; use relative in prod builds.
const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

function api(path: string) {
  return `${API_BASE}${path}`;
}

async function j<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(api(path), init);
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await r.json()) as T;
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { ok: false, error: text || `${r.status} ${r.statusText}` } as unknown as T;
  }
}

// Map server fields to UI encryption string
function toEnc(smtpSecure?: boolean, port?: number): SMTPEnc {
  if (smtpSecure) return "TLS/SSL";
  if (port === 587) return "STARTTLS";
  if (port === 25) return "None";
  return "STARTTLS";
}

// Map UI encryption to server boolean
function toSecure(enc?: SMTPEnc): boolean {
  return enc === "TLS/SSL";
}

/** ---------------- Connections: config ---------------- */
export async function getConfig() {
  const data = await j<any>("/api/config");
  // Server keys: smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromAddress, plexUrl, plexToken, tautulliUrl, tautulliApiKey
  return {
    plexUrl: data.plexUrl || "",
    plexToken: data.plexToken || "",
    tautulliUrl: data.tautulliUrl || "",
    tautulliApiKey: data.tautulliApiKey || "",

    fromAddress: data.fromAddress || "",
    smtpEmailLogin: data.smtpUser || "",
    // Never return password to UI
    smtpServer: data.smtpHost || "",
    smtpPort: typeof data.smtpPort === "number" ? data.smtpPort : 587,
    smtpEncryption: toEnc(!!data.smtpSecure, data.smtpPort),
  };
}

export async function postConfig(body: {
  plexUrl?: string;
  plexToken?: string;
  tautulliUrl?: string;
  tautulliApiKey?: string;

  fromAddress?: string;
  smtpEmailLogin?: string;
  smtpEmailPassword?: string; // optional: empty string will not change server stored password
  smtpServer?: string;
  smtpPort?: number;
  smtpEncryption?: SMTPEnc;
}) {
  const serverBody: any = {
    // Plex and Tautulli
    plexUrl: body.plexUrl,
    plexToken: body.plexToken,
    tautulliUrl: body.tautulliUrl,
    tautulliApiKey: body.tautulliApiKey,

    // SMTP mapped to server schema
    fromAddress: body.fromAddress,
    smtpUser: body.smtpEmailLogin,
    smtpHost: body.smtpServer,
    smtpPort: body.smtpPort,
    smtpSecure: toSecure(body.smtpEncryption),
  };

  // Only send smtpPass if non-empty so we do not clear stored value
  if (typeof body.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0) {
    serverBody.smtpPass = body.smtpEmailPassword;
  }

  return j("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serverBody),
  });
}

/** ---------------- Connections: status for the card ---------------- */
export async function getStatus() {
  return j("/api/status");
}

/** ---------------- Connection tests (slashed routes) ---------------- */
export async function testPlex(body?: { plexUrl?: string; plexToken?: string }) {
  return j("/api/test/plex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plexUrl: body?.plexUrl,
      plexToken: body?.plexToken,
    }),
  });
}

export async function testTautulli(body?: { tautulliUrl?: string; tautulliApiKey?: string }) {
  return j("/api/test/tautulli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tautulliUrl: body?.tautulliUrl,
      tautulliApiKey: body?.tautulliApiKey,
    }),
  });
}

export async function testSmtp(body?: {
  smtpEmailLogin?: string;
  smtpEmailPassword?: string;
  smtpServer?: string;
  smtpPort?: number;
  smtpEncryption?: SMTPEnc;
  fromAddress?: string;
  to?: string; // optional recipient for test email
}) {
  const serverBody: any = {
    smtpUser: body?.smtpEmailLogin,
    smtpHost: body?.smtpServer,
    smtpPort: body?.smtpPort,
    smtpSecure: toSecure(body?.smtpEncryption),
    fromAddress: body?.fromAddress,
    to: body?.to,
  };
  if (typeof body?.smtpEmailPassword === "string" && body.smtpEmailPassword.length > 0) {
    serverBody.smtpPass = body.smtpEmailPassword;
  }

  // Server exposes POST /api/test-email
  return j("/api/test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serverBody),
  });
}

/** =================== SCHEDULE =================== */
// GET saved schedule for the card and modal
export async function getSchedule() {
  return j("/api/schedule");
}

// POST schedule (modal save)
export async function postSchedule(body: {
  dayOfWeek?: number; // 0=Sun..6=Sat
  hour?: number;      // 0..23
  minute?: number;    // 0..59
  timezone?: string;  // optional
  cron?: string;      // if your server supports cron directly
}) {
  return j("/api/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------- TAUTULLI HELPERS (via backend proxy) ----------------

type TautulliResponse<T> = {
  response: { result: "success" | "error"; data?: T; message?: string };
};

function qp(params: Record<string, any> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    q.set(k, String(v));
  }
  return q.toString();
}

// Low level helper: calls backend proxy /api/tautulli
async function tautulli<T = any>(cmd: string, params: Record<string, any> = {}): Promise<T> {
  const qs = qp({ cmd, ...params });
  const data = await j<TautulliResponse<T>>(`/api/tautulli?${qs}`);
  if (!data || !("response" in data)) throw new Error("Bad Tautulli response");
  if (data.response.result !== "success") {
    throw new Error(data.response.message || "Tautulli error");
  }
  return data.response.data as T;
}

// Convenient wrappers for the card
export async function getTautulliAppInfo() {
  // Modern command, replaces app_info
  return tautulli("get_tautulli_info");
}

export async function getTautulliHomeStats() {
  return tautulli("get_home_stats");
}

export async function getTautulliHistory(afterEpochSeconds: number, length: number = 1000) {
  return tautulli("get_history", {
    after: afterEpochSeconds,
    length,
    order_column: "date",
    order_dir: "desc",
  });
}
