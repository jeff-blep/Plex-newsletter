import React from "react";
import ConnectionSettingsModal from "./components/ConnectionSettingsModal";
import PlexMediaServerDataCard from "./components/PlexMediaServerDataCard";
import OwnerRecommendationCard from "./components/OwnerRecommendationCard";
import ScheduleCard, { type ScheduleCardHandle } from "./components/ScheduleCard";
import HistoryCard from "./components/HistoryCard";
import RecipientsCard from "./components/RecipientsCard";

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

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <header className="px-5 py-3 border-b border-base-300 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Plex Newsletter • Settings</h1>
        <button
          className="btn btn-sm"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-5 space-y-6">
        {/* Top row: Schedule, Outgoing Email, History */}
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

          {/* Outgoing Email — opens Connection Settings modal */}
          <div
            className="card bg-base-200 shadow-sm card-compact hover:ring-2 hover:ring-primary/60 transition cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setShowConn(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowConn(true)}
          >
            <div className="card-body p-3">
              <h2 className="card-title text-base md:text-xl">Outgoing Email</h2>
              <p className="text-xs md:text-sm opacity-70">
                Sender address used for the newsletter
              </p>
              <div className="mt-8" />
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
                <HistoryCard />
              </div>
            </div>
          </div>
        </section>

        {/* Plex Media Server Data */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">Plex Media Server Data (Last 7 days)</h2>
            <div className="mt-2">
              <PlexMediaServerDataCard />
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
        onClose={() => setShowConn(false)}
        onSaved={() => setShowConn(false)}
      />
    </div>
  );
}
