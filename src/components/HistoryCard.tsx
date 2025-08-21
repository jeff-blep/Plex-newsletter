// src/components/HistoryCard.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { createPortal } from "react-dom";

/**
 * Optional handle: if some parent already uses a ref to open the modal.
 * (Not required — this component works fine without it.)
 */
export type HistoryCardHandle = { open: () => void };

const LS_KEY = "history.lookbackDays";

/* ---------- utilities ---------- */
function clampDays(n: unknown, min = 1, max = 365): number {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return 7;
  return Math.max(min, Math.min(max, v));
}

function readLocal(): number | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw == null) return null;
    return clampDays(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(days: number) {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(clampDays(days)));
  } catch {
    /* ignore */
  }
}

/** Best-effort GET /api/config → { lookbackDays } */
async function fetchLookbackDays(): Promise<number | null> {
  try {
    const r = await fetch("/api/config");
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({} as any));
    const v = (j as any)?.lookbackDays;
    if (v === undefined || v === null) return null;
    return clampDays(v);
  } catch {
    return null;
  }
}

/** Best-effort POST /api/config { lookbackDays } (no throw) */
async function saveLookbackDays(days: number): Promise<void> {
  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookbackDays: clampDays(days) }),
    });
  } catch {
    /* ignore; localStorage still keeps UI correct */
  }
}

/* ---------- component ---------- */
/**
 * HistoryCard (self-contained)
 *
 * - Renders NO inner ".card" to avoid card-within-a-card.
 * - Auto-finds the nearest parent ".card" and:
 *    • overlays a transparent button so the WHOLE card opens the modal
 *    • injects a centered summary line (e.g., "14 days") like the schedule card
 * - Modal has a single "Days" (1–365) numeric field.
 * - Persists to localStorage and (if server supports it) POSTs to /api/config,
 *   so it survives reloads without changing any other files.
 */
const HistoryCard = forwardRef<HistoryCardHandle, {}>(function HistoryCard(_props, ref) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // value shown on the card
  const [days, setDays] = useState<number>(7);
  // editable draft inside the modal
  const [draft, setDraft] = useState<number>(7);

  // auto-overlay plumbing
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [cardEl, setCardEl] = useState<HTMLElement | null>(null);

  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }));

  // Hydrate quickly from localStorage, then reconcile with server (if available)
  useEffect(() => {
    let alive = true;
    const local = readLocal();
    if (local != null) {
      setDays(local);
      setDraft(local);
    }
    (async () => {
      const server = await fetchLookbackDays();
      if (!alive) return;
      if (server != null) {
        setDays(server);
        setDraft(server);
        writeLocal(server);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Find the nearest parent ".card" and ensure it's position:relative for absolute overlay
  useEffect(() => {
    const el = anchorRef.current?.closest<HTMLElement>(".card") ?? null;
    if (el) {
      if (!el.classList.contains("relative")) el.classList.add("relative");
      setCardEl(el);
    }
  }, []);

  const display = useMemo(() => {
    const d = clampDays(days);
    return `${d} day${d === 1 ? "" : "s"}`;
  }, [days]);

  async function handleSave() {
    setSaving(true);
    try {
      const v = clampDays(draft);
      // optimistic update + local persistence for instant UX + reload
      setDays(v);
      writeLocal(v);
      // best-effort server persistence
      await saveLookbackDays(v);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  return (
    <>
      {/* Invisible anchor so we can locate the parent .card */}
      <div ref={anchorRef} />

      {/* Inject overlay + summary into the parent .card (no nested card markup here) */}
      {cardEl &&
        createPortal(
          <>
            {/* Entire card becomes a button to open the modal */}
            <button
              type="button"
              aria-label="Open history lookback settings"
              onClick={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
              className="absolute inset-0 z-10 cursor-pointer bg-transparent outline-none focus:ring-2 focus:ring-primary"
            />
            {/* Summary line, visually similar to Sending Schedule’s summary */}
            <div className="absolute bottom-6 left-0 right-0 z-20 pointer-events-none flex justify-center">
              <span className="text-base md:text-lg font-medium">{display}</span>
            </div>
          </>,
          cardEl
        )}

      {/* Modal */}
      {open && (
        <div className="modal modal-open" onClick={() => setOpen(false)}>
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="Set history lookback"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg">History (Days)</h3>
            <p className="py-2 text-sm opacity-70">
              Enter how many days of Plex server history to include (1–365).
            </p>

            <label className="form-control w-full mt-1">
              <div className="label">
                <span className="label-text">Days</span>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                className="input input-bordered w-full"
                value={Number.isFinite(draft) ? draft : 7}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  setDraft(Number.isFinite(n) ? n : 7);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
              <div className="label">
                <span className="label-text-alt opacity-70">Range: 1–365</span>
              </div>
            </label>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving}
                aria-busy={saving}
              >
                Save
              </button>
            </div>
          </div>
          <button className="modal-backdrop" onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );
});

export default HistoryCard;
