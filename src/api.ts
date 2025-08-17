export const SERVER = "http://localhost:5174";

export async function getConfig() {
  const r = await fetch(`${SERVER}/config`);
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j.config;
}

export async function postConfig(partial: any) {
  const r = await fetch(`${SERVER}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j.config;
}

export async function runNow() {
  const r = await fetch(`${SERVER}/run`, { method: "POST" });
  const j = await r.json();
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
