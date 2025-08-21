// src/App.tsx
import React from "react";
import { Moon, Sun } from "lucide-react";
import ConnectionSettingsModal from "./components/ConnectionSettingsModal";
import PlexMediaServerDataCard from "./components/PlexMediaServerDataCard";
import OwnerRecommendationCard from "./components/OwnerRecommendationCard";
import ScheduleCard, { type ScheduleCardHandle } from "./components/ScheduleCard";
import HistoryCard from "./components/HistoryCard";
import RecipientsCard from "./components/RecipientsCard";
import { getStatus, getConfig } from "./api";

type ConnStatus = {
  emailOk: boolean;
  plexOk: boolean;
  tautulliOk: boolean;
};

export default function App() {
  const [showConn, setShowConn] = React.useState(false);
  const scheduleRef = React.useRef<ScheduleCardHandle>(null);

  // theme toggle (persisted)
  const [theme, setTheme] = React.useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" ? (saved as any) : "dark";
  });
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // --- Connection status for the card ---
  const [connStatus, setConnStatus] = React.useState<ConnStatus>({
    emailOk: false,
    plexOk: false,
    tautulliOk: false,
  });
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  const refreshStatus = React.useCallback(async () => {
    try {
      setStatusLoading(true);
      setStatusError(null);
      const s = await getStatus();
      setConnStatus({
        emailOk: !!s?.emailOk,
        plexOk: !!s?.plexOk,
        tautulliOk: !!s?.tautulliOk,
      });
    } catch (e: any) {
      setStatusError(e?.message || String(e));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  // initial load
  React.useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // refresh when tab regains focus
  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refreshStatus();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshStatus]);

  const handleConnClose = () => {
    setShowConn(false);
    setTimeout(() => refreshStatus(), 150);
  };

  const handleConnSaved = () => {
    setShowConn(false);
    refreshStatus();
  };

  // --- NEW: history lookback (days) shared between HistoryCard and Plex card ---
  const [historyDays, setHistoryDays] = React.useState<number>(7);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getConfig();
        const d = typeof (cfg as any)?.lookbackDays === "number" ? (cfg as any).lookbackDays : 7;
        if (!cancelled) setHistoryDays(d);
      } catch {
        // ignore, keep default 7
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onHistoryDaysChange = React.useCallback((d: number) => {
    setHistoryDays(d);
  }, []);

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      {/* FIXED TOP BANNER */}
      <header className="fixed top-0 inset-x-0 z-50 bg-base-100 border-b border-base-300">
        <div className="px-5 py-3 flex items-center justify-between max-w-6xl mx-auto">
          <h1 className="text-lg font-semibold truncate">
            Newzletr • Settings
          </h1>
          <button
            className="btn btn-sm"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-gray-500" />
                <span>Light</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-gray-500" />
                <span>Dark</span>
              </div>
            )}
          </button>
        </div>
      </header>

      {/* Offset for fixed header */}
      <main className="max-w-6xl mx-auto p-5 pt-14 mt-6 space-y-6">
        {/* Top row: Schedule, Connection Settings, History */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Schedule — ENTIRE CARD CLICKABLE */}
          <div
            className="card bg-base-200 shadow-sm card-compact hover:ring-2 hover:ring-primary/60 transition cursor-pointer focus:outline-none"
            role="button"
            tabIndex={0}
            onClick={() => scheduleRef.current?.open()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && scheduleRef.current?.open()}
          >
            <div className="card-body p-3">
              <h2 className="card-title text-base md:text-xl">Sending Schedule</h2>
              <p className="text-xs md:text-sm opacity-70">
                When the newsletter will be automatically sent
              </p>
              <div className="mt-8">
                {/* Centered summary only; modal opened by ref */}
                <ScheduleCard ref={scheduleRef} />
              </div>
            </div>
          </div>

          {/* Connection Settings — opens Connection Settings modal */}
          <div
            className="card bg-base-200 shadow-sm card-compact hover:ring-2 hover:ring-primary/60 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setShowConn(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowConn(true)}
          >
            <div className="card-body p-3">
              <h2 className="card-title text-base md:text-xl">Connection Settings</h2>
              <p className="text-xs md:text-sm opacity-70">
                Configure Email (SMTP), Plex, and Tautulli connections.
              </p>

              <div className="mt-6 text-sm md:text-base">
                {statusLoading ? (
                  <div className="opacity-70">Checking status…</div>
                ) : statusError ? (
                  <div className="text-red-400">Failed to load status: {statusError}</div>
                ) : (
                  <div className="space-y-1">
                    <div>Email: {connStatus.emailOk ? "✅" : "❌"}</div>
                    <div>Plex: {connStatus.plexOk ? "✅" : "❌"}</div>
                    <div>Tautulli: {connStatus.tautulliOk ? "✅" : "❌"}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* History */}
          <div className="card bg-base-200 shadow-sm card-compact">
            <div className="card-body p-3">
              <h2 className="card-title text-base md:text-xl">History</h2>
              <p className="text-xs md:text-sm opacity-70">
                How many days to pull data for the newsletter
              </p>
              <div className="mt-3 text-sm">
                <HistoryCard onDaysChange={onHistoryDaysChange} />
              </div>
            </div>
          </div>
        </section>

        {/* Plex Media Server Data */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">
              Plex Media Server Data (Last {historyDays} day{historyDays === 1 ? "" : "s"})
            </h2>
            <div className="mt-2">
              <PlexMediaServerDataCard days={historyDays} />
            </div>
          </div>
        </section>

        {/* Owner Recommendation */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">Owner Recommendation</h2>
            <div className="mt-3">
              <OwnerRecommendationCard />
            </div>
          </div>
        </section>

        {/* Recipients */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">Recipients</h2>
            <div className="mt-3">
              <RecipientsCard />
            </div>
          </div>
        </section>
      </main>

      <ConnectionSettingsModal
        isOpen={showConn}
        onClose={handleConnClose}
        onSaved={handleConnSaved}
      />
    </div>
  );
}
