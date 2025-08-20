// src/App.tsx
import React from "react";
import ConnectionSettingsModal from "./components/ConnectionSettingsModal";

import PlexMediaServerDataCard from "./components/PlexMediaServerDataCard";
import OwnerRecommendationCard from "./components/OwnerRecommendationCard";
import ScheduleCard from "./components/ScheduleCard";
import HistoryCard from "./components/HistoryCard";
import RecipientsCard from "./components/RecipientsCard";

type Theme = "light" | "dark";

export default function App() {
  const [showConn, setShowConn] = React.useState(false);

  // -------- Theme handling (DaisyUI via data-theme on <html>) --------
  const [theme, setTheme] = React.useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    return saved === "light" || saved === "dark" ? saved : "dark"; // default to current look
  });

  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      {/* Top bar */}
      <header className="px-5 py-3 border-b border-base-300 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Plex Newsletter • Settings</h1>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-5 space-y-6">
        {/* Top 3 cards (compact height) — order: Schedule, Outgoing Email, History */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Schedule (compact) */}
          <div className="card bg-base-200 shadow-sm card-compact">
            <div className="card-body p-3">
              <h2 className="card-title text-sm">Sending Schedule</h2>
              <p className="text-xs opacity-70">
                When the newsletter will be automatically sent
              </p>
              <div className="mt-2 text-sm">
                <ScheduleCard />
              </div>
            </div>
          </div>

          {/* Outgoing Email (compact) — clickable to open modal */}
          <button
            type="button"
            className="card bg-base-200 shadow-sm card-compact text-left hover:ring-2 hover:ring-primary transition focus:outline-none"
            onClick={() => setShowConn(true)}
          >
            <div className="card-body p-3">
              <h2 className="card-title text-sm">Outgoing Email</h2>
              <p className="text-xs opacity-70">
                Sender address used for the newsletter
              </p>
              {/* Removed the separate "Configure" button per your preference */}
            </div>
          </button>

          {/* History (compact) */}
          <div className="card bg-base-200 shadow-sm card-compact">
            <div className="card-body p-3">
              <h2 className="card-title text-sm">History</h2>
              <p className="text-xs opacity-70">
                How many days to pull data for the newsletter
              </p>
              <div className="mt-2 text-sm">
                <HistoryCard />
              </div>
            </div>
          </div>
        </section>

        {/* Plex Media Server Data strip */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            {/* If this component renders its own title, you can remove this <h2> */}
            <h2 className="card-title text-base">
              Plex Media Server Data (Last 7 days)
            </h2>
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

        {/* Recipients (full-width) */}
        <section className="card bg-base-200 shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-base">Recipients</h2>
            <div className="mt-3">
              <RecipientsCard />
            </div>
          </div>
        </section>
      </main>

      {/* Connection Settings modal */}
      <ConnectionSettingsModal
        isOpen={showConn}
        onClose={() => setShowConn(false)}
        onSaved={() => setShowConn(false)}
      />
    </div>
  );
}
