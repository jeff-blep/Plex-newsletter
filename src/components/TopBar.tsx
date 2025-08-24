import React from "react";
import { Moon, Sun } from "lucide-react";

function getTheme(): string {
  // DaisyUI theme name. Adjust if you use custom themes.
  const saved = localStorage.getItem("theme");
  if (saved) return saved;
  // Try to respect system preference on first load
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  return prefersDark ? "dark" : "light";
}
function setTheme(t: string) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("theme", t);
}

export default function TopBar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<string>(() => getTheme());

  React.useEffect(() => {
    setTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-base-100/90 backdrop-blur border-b border-base-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Left: Brand + section */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-base truncate">Newzlettr</span>
          <span className="opacity-60">•</span>
          <span className="opacity-70 truncate">Settings</span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {rightSlot /* optional slot for per-page actions */}
          <button
            type="button"
            onClick={toggleTheme}
            className="btn btn-ghost btn-sm"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {/* Greyscale, flat line icons */}
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-gray-500" />
            ) : (
              <Moon className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
