// src/components/HistoryCard.tsx
import React from "react";
import { getConfig, postConfig } from "../api";

type Props = {
  onDaysChange?: (days: number) => void;
};

export default function HistoryCard({ onDaysChange }: Props) {
  const [days, setDays] = React.useState<number>(7);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const cfg = await getConfig();
        const d = typeof (cfg as any)?.lookbackDays === "number" ? (cfg as any).lookbackDays : 7;
        if (!cancelled) setDays(d);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await postConfig({ lookbackDays: days });
      setNotice("Saved history window.");
      onDaysChange?.(days);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          
        </div>
        {loading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {notice && (
        <div className="mt-2 p-2 rounded bg-green-500/15 text-green-700 text-sm">{notice}</div>
      )}
      {error && (
        <div className="mt-2 p-2 rounded bg-red-500/15 text-red-700 text-sm">{error}</div>
      )}

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 items-center">
        <input
          type="number"
          min={1}
          max={90}
          className="input input-bordered w-full"
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
        />
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-2 text-xs opacity-70">
        Current: last <span className="font-semibold">{days}</span> day{days === 1 ? "" : "s"}
      </div>
    </>
  );
}
