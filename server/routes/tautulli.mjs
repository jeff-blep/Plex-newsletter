import express from "express";
import { tCall } from "../tautulli.js";

export const router = express.Router();

/**
 * GET /tautulli/home?days=7
 * Stable passthrough of Tautulli "home" blocks (movies/shows/platforms/users/etc.).
 */
router.get("/home", async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const data = await tCall("get_home_stats", {
      time_range: days,   // days back
      stats_type: 0,      // 0 = plays, 1 = duration
      stats_count: 25,    // UI will slice
    });
    const home = Array.isArray(data) ? data : (data?.data ?? []);
    res.json({ ok: true, days, home });
  } catch (e) {
    console.error("tautulli /home error:", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
