// server.js
import express from "express";
import nodemailer from "nodemailer";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ---------- SMTP Test ----------
app.post("/api/test/smtp", async (req, res) => {
  const { host, port, secure, user, pass, to } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from: user,
      to,
      subject: "SMTP Test Email",
      text: "This is a test email from Plex Newsletter App",
    });

    res.json({ success: true, message: "SMTP test email sent successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- Plex Test ----------
app.post("/api/test/plex", async (req, res) => {
  const { url, token } = req.body;

  try {
    const response = await fetch(`${url}/?X-Plex-Token=${token}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text(); // Plex often returns XML, not JSON
    res.json({ success: true, message: "Connected to Plex successfully", raw: text.substring(0, 200) + "..." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- Tautulli Test ----------
app.post("/api/test/tautulli", async (req, res) => {
  const { url, apiKey } = req.body;

  try {
    const response = await fetch(`${url}/api/v2?apikey=${apiKey}&cmd=pingsystem`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data?.response?.result === "success") {
      res.json({ success: true, message: "Connected to Tautulli successfully" });
    } else {
      throw new Error("Invalid Tautulli response");
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
