// src/components/ScheduleCard.tsx
import React, { useState } from "react";

type Props = {
  schedule: any;
  save: (partial: any) => Promise<void> | void;
};

export default function ScheduleCard({ schedule, save }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>(null);

  function describeSchedule(): string {
    const s = schedule || {};
    if (s.frequency) {
      const freq = String(s.frequency).toLowerCase();
      const hh = typeof s.hour === "number" ? s.hour : 9;
      const mm = typeof s.minute === "number" ? s.minute : 0;
      const ampm = hh >= 12 ? "PM" : "AM";
      const hour12 = ((hh + 11) % 12) + 1;
      const t = `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
      if (freq === "week") return `${(s.dayOfWeek || "Monday")[0].toUpperCase() + (s.dayOfWeek || "monday").slice(1)}s at ${t}`;
      if (freq === "hour") return `Every hour at minute ${mm}`;
      if (freq === "month") return `Day ${s.dayOfMonth || 1} each month at ${t}`;
      if (freq === "year") return `Every ${MONTHS[s.month || 0]} 1 at ${t}`;
      return `Daily at ${t}`;
    }
    return "Not configured";
  }

  function edit() {
    const s = schedule || {};
    setDraft({
      frequency: s.frequency || "week",
      dayOfWeek: s.dayOfWeek || "monday",
      hour: typeof s.hour === "number" ? s.hour : 9,
      minute: typeof s.minute === "number" ? s.minute : 0,
      dayOfMonth: s.dayOfMonth || 1,
      month: s.month || 0,
      cron: s.cron || "",
    });
    setOpen(true);
  }

  const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
  const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function to24h(hour12: number, ampm: "AM" | "PM") {
    return ampm === "AM" ? hour12 % 12 : (hour12 % 12) + 12;
  }

  async function saveSchedule() {
    const d = draft || {};
    if (d.cron && d.cron.trim()) {
      await save({ schedule: { mode: "custom", cron: d.cron } });
      setOpen(false);
      return;
    }
    const hh = to24h(Number(d.hour12 || 9), d.ampm || "AM");
    const payload: any = {
      frequency: d.frequency,
      hour: hh,
      minute: d.minute || 0,
    };
    if (d.frequency === "week") payload.dayOfWeek = d.dayOfWeek;
    if (d.frequency === "month") payload.dayOfMonth = d.dayOfMonth || 1;
    if (d.frequency === "year") payload.month = d.month || 0;
    await save({ schedule: payload });
    setOpen(false);
  }

  return (
    <>
      {/* Card */}
      <div
        className="card bg-base-100 shadow hover:shadow-md transition-shadow cursor-pointer"
        onClick={edit}
      >
        <div className="card-body">
          <div className="card-title">Sending Schedule</div>
          <div className="text-sm opacity-70 mb-1">When the newsletter will be automatically sent</div>
          <div className="text-sm">{describeSchedule()}</div>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl">
            <h3 className="font-bold text-lg mb-2">Sending Schedule</h3>
            <p className="text-sm opacity-70 mb-4">Choose when the newsletter is sent automatically.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Frequency */}
              <label className="form-control">
                <div className="label"><span className="label-text">Every</span></div>
                <select className="select select-bordered"
                  value={draft?.frequency || "week"}
                  onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
                >
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </label>

              {/* Day of week */}
              {draft?.frequency === "week" && (
                <label className="form-control">
                  <div className="label"><span className="label-text">On</span></div>
                  <select className="select select-bordered"
                    value={draft?.dayOfWeek || "monday"}
                    onChange={(e) => setDraft({ ...draft, dayOfWeek: e.target.value })}
                  >
                    {DAYS.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </label>
              )}

              {/* Day of month */}
              {draft?.frequency === "month" && (
                <label className="form-control">
                  <div className="label"><span className="label-text">Day</span></div>
                  <select className="select select-bordered"
                    value={draft?.dayOfMonth || 1}
                    onChange={(e) => setDraft({ ...draft, dayOfMonth: Number(e.target.value) })}
                  >
                    {DAYS_OF_MONTH.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              )}

              {/* Month for yearly */}
              {draft?.frequency === "year" && (
                <label className="form-control">
                  <div className="label"><span className="label-text">Month</span></div>
                  <select className="select select-bordered"
                    value={draft?.month || 0}
                    onChange={(e) => setDraft({ ...draft, month: Number(e.target.value) })}
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </label>
              )}

              {/* Time */}
              <div className="grid grid-cols-3 gap-3 md:col-span-2">
                <label className="form-control">
                  <div className="label"><span className="label-text">Hour</span></div>
                  <select className="select select-bordered"
                    value={draft?.hour12 ?? ((((draft?.hour ?? 9) + 11) % 12) + 1)}
                    onChange={(e) => setDraft({ ...draft, hour12: Number(e.target.value) })}
                  >
                    {HOURS12.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>

                <label className="form-control">
                  <div className="label"><span className="label-text">Minute</span></div>
                  <select className="select select-bordered"
                    value={draft?.minute ?? 0}
                    onChange={(e) => setDraft({ ...draft, minute: Number(e.target.value) })}
                  >
                    {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                  </select>
                </label>

                <label className="form-control">
                  <div className="label"><span className="label-text">AM / PM</span></div>
                  <select className="select select-bordered"
                    value={draft?.ampm ?? ((draft?.hour ?? 9) >= 12 ? "PM" : "AM")}
                    onChange={(e) => setDraft({ ...draft, ampm: e.target.value as "AM" | "PM" })}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Custom CRON */}
            <div className="mt-4">
              <label className="form-control">
                <div className="label">
                  <span className="label-text">Custom CRON (optional)</span>
                  <span className="label-text-alt opacity-70">Overrides above</span>
                </div>
                <input
                  className="input input-bordered"
                  placeholder="e.g., 0 9 * * 1"
                  value={draft?.cron || ""}
                  onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
                />
              </label>
            </div>

            <div className="modal-action">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSchedule}>Save</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setOpen(false)}></div>
        </div>
      )}
    </>
  );
}
