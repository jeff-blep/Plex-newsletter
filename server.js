// server.js (ESM)
import express from "express";
import nodemailer from "nodemailer";
import { Agent as HttpsAgent } from "node:https";

const app = express();
app.use(express.json());

function agentForUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol === "https:") {
      // Allow self-signed certs on local appliances (Plex/Tautulli on LAN)
      return new HttpsAgent({ rejectUnauthorized: false });
    }
  } catch (_) {}
  return undefined;
}

app.post("/api/test-smtp", async (req, res) => {
  try {
    const { host, port, secure, starttls, auth, fromName, from, replyTo } = req.body || {};

    if (!host || !port || !from) {
      return res.status(400).json({ message: "host, port, and from are required" });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: !!secure, // true for 465, false for 587/starttls
      auth: auth?.user ? auth : undefined,
      requireTLS: !!starttls,
      tls: starttls ? { minVersion: "TLSv1.2" } : undefined,
    });

    await transporter.verify();

    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${from}>` : from,
      to: from,
      subject: "SMTP test",
      text: "Connected + sendMail() worked.",
      headers: replyTo ? { "Reply-To": replyTo } : undefined,
    });

    res.json({ message: "Connected and sent test email." });
  } catch (err) {
    res.status(500).json({ message: err?.message || String(err) });
  }
});

// Test Plex connectivity/token
app.post("/api/test-plex", async (req, res) => {
  const { plexUrl, plexApi } = req.body || {};
  if (!plexUrl || !plexApi) {
    return res.status(400).json({ message: "plexUrl and plexApi are required" });
  }
  try {
    const base = String(plexUrl).replace(/\/$/, "");
    const url = `${base}/status/sessions?X-Plex-Token=${encodeURIComponent(plexApi)}`;
    const r = await fetch(url, { agent: agentForUrl(base) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // We don't need to parse XML; a 200 is enough to confirm reachability+token
    res.json({ message: "Plex reachable and token accepted." });
  } catch (e) {
    res.status(500).json({ message: e?.message || String(e) });
  }
});

// Test Tautulli connectivity/API key
app.post("/api/test-tautulli", async (req, res) => {
  const { tautulliUrl, tautulliApi } = req.body || {};
  if (!tautulliUrl || !tautulliApi) {
    return res.status(400).json({ message: "tautulliUrl and tautulliApi are required" });
  }
  try {
    const base = String(tautulliUrl).replace(/\/$/, "");
    const url = `${base}/api/v2?apikey=${encodeURIComponent(tautulliApi)}&cmd=get_activity`;
    const r = await fetch(url, { agent: agentForUrl(base) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json().catch(() => null);
    if (j && j.response && j.response.result === "success") {
      res.json({ message: "Tautulli reachable and API key accepted." });
    } else {
      // Even if JSON structure is unexpected, a 200 is good enough
      res.json({ message: "Tautulli reachable." });
    }
  } catch (e) {
    res.status(500).json({ message: e?.message || String(e) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`SMTP test API on http://localhost:${PORT}`));
