import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: "http://localhost:5173" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/send", async (req, res) => {
  try {
    const { host, port, secure, username, password, from, to, subject, html, text } = req.body || {};

    if (!host || !port || typeof secure === "undefined" || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing SMTP settings (host, port, secure, username, password)" });
    }
    if (!from || !to || !subject || (!html && !text)) {
      return res.status(400).json({ ok: false, error: "Missing email fields (from, to, subject, html|text)" });
    }

    // Debug: log what we got (but not the password)
    console.log("[SMTP] host=%s port=%s secure=%s user=%s", host, port, secure, username);

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Boolean(secure),        // true = SSL/TLS (usually 465), false = STARTTLS (usually 587)
      auth: { user: username, pass: password },
      // If you're on 587, the server should advertise STARTTLS; requireTLS helps ensure we upgrade.
      requireTLS: !Boolean(secure),
      // Uncomment the line below ONLY if you have a self-signed cert and trust it:
      // tls: { rejectUnauthorized: false },
    });

    await transporter.verify(); // quick capability check

    const info = await transporter.sendMail({ from, to, subject, text: text || undefined, html: html || undefined });
    console.log("[SMTP] sent messageId=%s accepted=%j rejected=%j", info.messageId, info.accepted, info.rejected);

    res.json({ ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (e) {
    console.error("[SMTP] send error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 5174;
app.listen(PORT, () => {
  console.log(`SMTP sender running on http://localhost:${PORT}`);
});
