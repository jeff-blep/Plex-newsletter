// src/pages/Settings.tsx
import React, { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { getConfig, postConfig, runNow } from "../api";

// Cards
import PlexMediaServerDataCard from "../components/PlexMediaServerDataCard";
import OwnerRecommendationCard from "../components/OwnerRecommendationCard";
import ScheduleCard from "../components/ScheduleCard";
import HistoryCard from "../components/HistoryCard";
import OutgoingEmailCard from "../components/OutgoingEmailCard";
import RecipientsCard from "../components/RecipientsCard";

// Lazy-load the heavy WYSIWYG to speed up initial render
const EmailTemplateCard = lazy(() => import("../components/EmailTemplateCard"));

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
      (window as any).toast?.success?.("Saved ✓");
    } catch (e: any) {
      setError(e?.message || String(e));
      (window as any).toast?.error?.("Save failed: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    try {
      const res = await runNow();
      (window as any).toast?.success?.("Sent: " + JSON.stringify(res.sent));
    } catch (e: any) {
      (window as any).toast?.error?.("Run failed: " + (e?.message || e));
    }
  }

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
          <button
            className="btn btn-accent"
            onClick={handleRunNow}
            disabled={saving}
          >
            Send Newsletter Now
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto p-6 grid gap-6">
        {/* Top row: three mini-cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ScheduleCard schedule={config?.schedule} save={save} />
          <HistoryCard lookbackDays={config?.lookbackDays || 7} save={save} />
          <OutgoingEmailCard smtpConfig={config?.smtp} save={save} />
        </div>

        {/* Plex Media Server Data */}
        <PlexMediaServerDataCard days={config?.lookbackDays || 7} />

        {/* Owner Recommendation */}
        <OwnerRecommendationCard config={config} save={save} />

        {/* Email Template (WYSIWYG) */}
        <Suspense
          fallback={
            <div className="card bg-base-100 shadow">
              <div className="card-body">
                <span className="loading loading-spinner loading-sm" /> Loading
                template editor…
              </div>
            </div>
          }
        >
          <EmailTemplateCard config={config} save={save} />
        </Suspense>

        {/* Recipients */}
        <RecipientsCard config={config} save={save} />

        {/* Footer Actions */}
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">Changes save immediately.</div>
              <div className="join">
                <button className="btn join-item" onClick={refresh} disabled={saving}>
                  Reload
                </button>
                <button
                  className="btn btn-accent join-item"
                  onClick={handleRunNow}
                  disabled={saving}
                >
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
