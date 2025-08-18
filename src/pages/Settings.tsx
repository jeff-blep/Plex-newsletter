import React, { useEffect, useMemo, useState } from "react";
import { getConfig, postConfig, runNow } from "../api";
import TautulliStatsCard from "../components/TautulliStatsCard";
import OwnerRecommendationCard from "../components/OwnerRecommendationCard";

type IncludeKeys = "recentMovies" | "recentEpisodes" | "serverMetrics" | "ownerRecommendation";
type ScheduleMode = "daily" | "weekly" | "custom";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getConfig();
      setConfig(cfg);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save(partial: any) {
    setSaving(true);
    setError(null);
    try {
      const updated = await postConfig(partial);
      setConfig(updated);
      (window as any).toast?.success?.("Saved ✓") ?? console.log("Saved ✓");
    } catch (e: any) {
      setError(e?.message || String(e));
      (window as any).toast?.error?.("Save failed: " + (e?.message || e)) ??
        console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    try {
      const res = await runNow();
      (window as any).toast?.success?.("Sent: " + JSON.stringify(res.sent)) ??
        alert("Sent: " + JSON.stringify(res.sent));
    } catch (e: any) {
      (window as any).toast?.error?.("Run failed: " + (e?.message || e)) ??
        alert("Run failed: " + (e?.message || e));
    }
  }

  function setScheduleMode(mode: ScheduleMode) {
    if (mode === "custom") {
      const cron =
        prompt("Enter CRON expression (min hour day month weekday)", config?.schedule?.cron || "0 9 * * 1") ||
        config?.schedule?.cron ||
        "0 9 * * 1";
      save({ schedule: { mode, cron } });
    } else {
      save({ schedule: { mode } });
    }
  }

  function addRecipient() {
    const name = prompt("Recipient name?") || "";
    const email = prompt("Recipient email?") || "";
    if (!email) return;
    save({ recipients: [...(config.recipients || []), { name, email }] });
  }
  function removeRecipient(index: number) {
    const next = [...(config.recipients || [])];
    next.splice(index, 1);
    save({ recipients: next });
  }
  function editRecipient(index: number) {
    const r = config.recipients[index];
    const name = prompt("Name:", r.name || "") ?? r.name;
    const email = prompt("Email:", r.email || "") ?? r.email;
    const next = [...config.recipients];
    next[index] = { name, email };
    save({ recipients: next });
  }
  function toggleInclude(k: IncludeKeys, val: boolean) {
    save({ include: { [k]: val } });
  }

  // Cache some plex deep-link pieces in localStorage for OwnerRecommendation card.
  useEffect(() => {
    try {
      const plex = config?.plex || {};
      if (plex?.webBase) localStorage.setItem("plex.webBase", plex.webBase);
      if (plex?.machineIdentifier) localStorage.setItem("plex.machineIdentifier", plex.machineIdentifier);
      if (plex?.serverId) localStorage.setItem("plexServerId", plex.serverId);
      if (plex?.token) localStorage.setItem("plex.token", plex.token);
      if (plex?.url) localStorage.setItem("plex.url", plex.url);
    } catch {
      // ignore
    }
  }, [config]);

  const scheduleMode: ScheduleMode = (config?.schedule?.mode || "weekly") as ScheduleMode;
  const lookback = config?.lookbackDays || 7;
  const maskedFrom = useMemo(() => config?.smtp?.from || "(not set)", [config]);

  if (loading) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center p-6">
        <div className="alert alert-error max-w-lg">
          <span>Error loading settings: {error}</span>
          <button className="btn btn-sm ml-auto" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <div className="alert">No config loaded.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Top Nav */}
      <div className="navbar bg-base-100 shadow">
        <div className="flex-1 px-2">
          <span className="text-lg font-semibold">Plex Newsletter • Settings</span>
        </div>
        <div className="flex-none gap-2 pr-2">
          <button className="btn btn-accent" onClick={handleRunNow} disabled={saving}>
            Send Newsletter Now
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-6 grid gap-6">
        {/* Summary */}
        <div className="stats shadow bg-base-100">
          <div className="stat">
            <div className="stat-title">Schedule</div>
            <div className="stat-value text-lg capitalize">{scheduleMode}</div>
            <div className="stat-desc">
              {scheduleMode === "custom"
                ? (config.schedule?.cron || "")
                : scheduleMode === "daily"
                ? "Every day at 09:00"
                : "Mondays at 09:00"}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">Lookback</div>
            <div className="stat-value text-lg">{lookback}d</div>
            <div className="stat-desc">How far back to pull data</div>
          </div>
          <div className="stat">
            <div className="stat-title">From</div>
            <div className="stat-value text-lg truncate">{maskedFrom}</div>
            <div className="stat-desc">SMTP sender address</div>
          </div>
        </div>

        {/* Schedule */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Schedule</h2>
            <div className="join">
              <button
                className={`btn join-item ${scheduleMode === "daily" ? "btn-primary" : ""}`}
                onClick={() => setScheduleMode("daily")}
              >
                Daily (9am)
              </button>
              <button
                className={`btn join-item ${scheduleMode === "weekly" ? "btn-primary" : ""}`}
                onClick={() => setScheduleMode("weekly")}
              >
                Weekly (Mon 9am)
              </button>
              <button
                className={`btn join-item ${scheduleMode === "custom" ? "btn-primary" : ""}`}
                onClick={() => setScheduleMode("custom")}
              >
                Custom CRON…
              </button>
            </div>
            {scheduleMode === "custom" ? (
              <div className="text-sm opacity-70">
                Current cron: <code>{config.schedule?.cron || "n/a"}</code>
              </div>
            ) : null}
          </div>
        </div>

        {/* Include Sections */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Include in Newsletter</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                ["recentMovies", "Recently added Movies"],
                ["recentEpisodes", "Recently added TV Episodes"],
                ["serverMetrics", "Server metrics (weekly graphs)"],
                ["ownerRecommendation", "Owner recommendation section"],
              ] as [IncludeKeys, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="toggle"
                    checked={!!config.include?.[key]}
                    onChange={(e) => toggleInclude(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Lookback */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Lookback Window</h2>
            <label className="form-control w-full max-w-xs">
              <div className="label">
                <span className="label-text">Days to look back</span>
              </div>
              <input
                type="number"
                min={1}
                className="input input-bordered w-full max-w-xs"
                value={lookback}
                onChange={(e) => save({ lookbackDays: Math.max(1, Number(e.target.value || 1)) })}
              />
            </label>
          </div>
        </div>

        {/* Tautulli Stats */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title">Tautulli Stats (Last {lookback} days)</h2>
            <TautulliStatsCard days={lookback} />
          </div>
        </div>

        {/* Owner Recommendation */}
        <OwnerRecommendationCard config={config} save={save} />

        {/* Recipients */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <h2 className="card-title">Recipients</h2>
              <button className="btn btn-primary" onClick={addRecipient}>
                Add Recipient
              </button>
            </div>
            {(!config.recipients || config.recipients.length === 0) ? (
              <div className="alert">
                <span>No recipients yet. Add at least one to enable sending.</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.recipients.map((r: any, i: number) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{r.name || "-"}</td>
                        <td>{r.email}</td>
                        <td className="text-right">
                          <div className="join">
                            <button className="btn btn-ghost join-item" onClick={() => editRecipient(i)}>
                              Edit
                            </button>
                            <button className="btn btn-error join-item" onClick={() => removeRecipient(i)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Changes save immediately.</div>
              <div className="join">
                <button className="btn join-item" onClick={refresh} disabled={saving}>
                  Reload
                </button>
                <button className="btn btn-accent join-item" onClick={handleRunNow} disabled={saving}>
                  Send Newsletter Now
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
