// src/components/OutgoingEmailCard.tsx
import React, { useState } from "react";

type Props = {
  smtpConfig: any;
  save: (partial: any) => Promise<void> | void;
};

export default function OutgoingEmailCard({ smtpConfig, save }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [testing, setTesting] = useState(false); const [testingPlex, setTestingPlex] = useState(false); const [testingTautulli, setTestingTautulli] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  function edit() {
    const cur = smtpConfig || {};
    setDraft({
      host: cur.host || "",
      port: cur.port || 587,
      security: cur.secure ? "ssl" : cur.starttls ? "starttls" : "none",
      authUser: cur.auth?.user || "",
      authPass: "__PRESERVE__",
      fromName: cur.fromName || "",
      from: cur.from || "",
      replyTo: cur.replyTo || "",
      plexUrl: cur.plexUrl || "",
      plexApi: cur.plexApi || "",
      tautulliUrl: cur.tautulliUrl || "",
      tautulliApi: cur.tautulliApi || "",
    });
    setOpen(true);
  }

  function normalize(d: any) {
    const port = Math.max(1, Math.min(65535, Number(d.port) || 587));
    return {
      host: String(d.host || "").trim(),
      port,
      secure: d.security === "ssl",
      starttls: d.security === "starttls",
      auth: {
        user: String(d.authUser || "").trim(),
        pass: d.authPass === "__PRESERVE__" ? smtpConfig?.auth?.pass || "" : String(d.authPass || ""),
      },
      fromName: String(d.fromName || "").trim(),
      from: String(d.from || "").trim(),
      replyTo: String(d.replyTo || "").trim(),
      plexUrl: String(d.plexUrl || "").trim(),
      plexApi: String(d.plexApi || "").trim(),
      tautulliUrl: String(d.tautulliUrl || "").trim(),
      tautulliApi: String(d.tautulliApi || "").trim(),
    };
  }

  async function saveSmtp() {
    const d = normalize(draft || {});
    if (!d.host) return (window as any).toast?.error?.("SMTP Host is required");
    if (!d.from) return (window as any).toast?.error?.("From Email is required");
    await save({ smtp: d });
    setOpen(false);
  }

  async function testSmtp() {
    setTesting(true);
    setTestResult(null);
    try {
      const d = normalize(draft || {});
      const res = await fetch("/api/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setTestResult({ ok: true, msg: j?.message || "SMTP test passed ✓" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || String(e) });
    } finally {
      setTesting(false);
    }
  }

  async function testPlex() {
    setTestingPlex(true);
    setTestResult(null);
    try {
      const d = normalize(draft || {});
      if (!d.plexUrl) throw new Error("Plex URL is required");
      if (!d.plexApi) throw new Error("Plex API Token is required");

      const res = await fetch("/api/test-plex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plexUrl: d.plexUrl, plexApi: d.plexApi })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setTestResult({ ok: true, msg: j?.message || "Plex connection OK ✓" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || String(e) });
    } finally {
      setTestingPlex(false);
    }
  }

  async function testTautulli() {
    setTestingTautulli(true);
    setTestResult(null);
    try {
      const d = normalize(draft || {});
      if (!d.tautulliUrl) throw new Error("Tautulli URL is required");
      if (!d.tautulliApi) throw new Error("Tautulli API Key is required");

      const res = await fetch("/api/test-tautulli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tautulliUrl: d.tautulliUrl, tautulliApi: d.tautulliApi })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setTestResult({ ok: true, msg: j?.message || "Tautulli connection OK ✓" });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || String(e) });
    } finally {
      setTestingTautulli(false);
    }
  }

  return (
    <>
      {/* Card */}
      <div
        className="card bg-base-100 shadow hover:shadow-md transition-shadow cursor-pointer"
        onClick={edit}
      >
        <div className="card-body">
          <div className="card-title">Connection Settings</div>
          <div className="text-sm opacity-70 mb-1">
            SMTP sender and external service endpoints
          </div>
          <div className="text-sm truncate">{smtpConfig?.from || "(not set)"}</div>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-2">Connection Settings</h3>
            <p className="text-sm opacity-70 mb-4">
              Configure SMTP and external service endpoints (Plex & Tautulli) used by the newsletter app.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Host */}
              <label className="form-control">
                <div className="label"><span className="label-text">SMTP Host</span></div>
                <input className="input input-bordered" value={draft?.host || ''} onChange={(e)=>setDraft({...draft, host:e.target.value})} />
              </label>
              {/* Port */}
              <label className="form-control">
                <div className="label"><span className="label-text">Port</span></div>
                <input type="number" min={1} max={65535} className="input input-bordered" value={draft?.port ?? 587} onChange={(e)=>setDraft({...draft, port:Number(e.target.value)})} />
              </label>
              {/* Security */}
              <label className="form-control">
                <div className="label"><span className="label-text">Security</span></div>
                <select className="select select-bordered" value={draft?.security || 'starttls'} onChange={(e)=>setDraft({...draft, security:e.target.value})}>
                  <option value="none">None</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="ssl">SSL/TLS</option>
                </select>
              </label>
              {/* Username */}
              <label className="form-control">
                <div className="label"><span className="label-text">Login (Username)</span></div>
                <input className="input input-bordered" value={draft?.authUser || ''} onChange={(e)=>setDraft({...draft, authUser:e.target.value})} />
              </label>
              {/* Password */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Password</span></div>
                <input type="password" className="input input-bordered" value={draft?.authPass || ''} onChange={(e)=>setDraft({...draft, authPass:e.target.value})} />
              </label>
              {/* From Name */}
              <label className="form-control">
                <div className="label"><span className="label-text">From Name</span></div>
                <input className="input input-bordered" value={draft?.fromName || ''} onChange={(e)=>setDraft({...draft, fromName:e.target.value})} />
              </label>
              {/* From Email */}
              <label className="form-control">
                <div className="label"><span className="label-text">From Email Address</span></div>
                <input className="input input-bordered" value={draft?.from || ''} onChange={(e)=>setDraft({...draft, from:e.target.value})} />
              </label>
              {/* Reply-To */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Reply-To (optional)</span></div>
                <input className="input input-bordered" value={draft?.replyTo || ''} onChange={(e)=>setDraft({...draft, replyTo:e.target.value})} />
              </label>
            </div>

            {/* Divider */}
            <div className="divider my-6">Plex & Tautulli</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Plex URL */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Plex URL</span></div>
                <input className="input input-bordered" value={draft?.plexUrl || ''} onChange={(e)=>setDraft({...draft, plexUrl:e.target.value})} placeholder="https://10.0.1.2:32400" />
              </label>
              {/* Plex API */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Plex API Token</span></div>
                <input className="input input-bordered" value={draft?.plexApi || ''} onChange={(e)=>setDraft({...draft, plexApi:e.target.value})} placeholder="**<PLEX_API>**" />
              </label>
              {/* Tautulli URL */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Tautulli URL</span></div>
                <input className="input input-bordered" value={draft?.tautulliUrl || ''} onChange={(e)=>setDraft({...draft, tautulliUrl:e.target.value})} placeholder="https://10.0.1.2:8181" />
              </label>
              {/* Tautulli API */}
              <label className="form-control md:col-span-2">
                <div className="label"><span className="label-text">Tautulli API Key</span></div>
                <input className="input input-bordered" value={draft?.tautulliApi || ''} onChange={(e)=>setDraft({...draft, tautulliApi:e.target.value})} placeholder="**<TAUTULLI_API>**" />
              </label>
            </div>

            {testResult && (
              <div className={`mt-3 text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
                {testResult.ok ? "✓ " : "✖ "} {testResult.msg}
              </div>
            )}

            <div className="modal-action flex items-center justify-between">
              <div className="flex gap-2">
                <button className={`btn btn-outline ${testingPlex ? "loading" : ""}`} disabled={testingPlex} onClick={testPlex}>Test Plex</button>
                <button className={`btn btn-outline ${testingTautulli ? "loading" : ""}`} disabled={testingTautulli} onClick={testTautulli}>Test Tautulli</button>
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={()=>setOpen(false)}>Cancel</button>
                <button className={`btn ${testing ? "loading" : ""}`} disabled={testing} onClick={testSmtp}>Test Email</button>
                <button className="btn btn-primary" onClick={saveSmtp}>Save</button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop" onClick={()=>setOpen(false)}></div>
        </div>
      )}
    </>
  );
}
