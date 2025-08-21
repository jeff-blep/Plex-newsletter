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

/** Map server fields -> UI encryption string */
function toEnc(smtpSecure?: boolean, port?: number): SMTPEnc {
  if (smtpSecure) return "TLS/SSL";
  if (port === 587) return "STARTTLS";
  if (port === 25) return "None";
  return "STARTTLS";
}

/** Map UI encryption -> server boolean */
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
    // never return password to UI
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
  smtpEmailPassword?: string; // optional: empty string won't change server-stored pass
  smtpServer?: string;
  smtpPort?: number;
  smtpEncryption?: SMTPEnc;
}) {
  const serverBody: any = {
    // Plex / Tautulli
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

  // Only send smtpPass if non-empty so we don’t clear stored value
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
/** GET saved schedule for the card + modal */
export async function getSchedule() {
  // Expecting server to return something like:
  // { dayOfWeek: 1, hour: 9, minute: 0, timezone: "America/Los_Angeles" }
  // or possibly { cron: "...", timezone: "..." }
  return j("/api/schedule");
}

/** POST schedule (modal save) */
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
