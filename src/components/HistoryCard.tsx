// src/components/HistoryCard.tsx
import React from "react";

type Props = {
  lookbackDays: number;
  save: (partial: any) => Promise<void> | void;
};

export default function HistoryCard({ lookbackDays, save }: Props) {
  return (
    <div className="card bg-base-100 shadow hover:shadow-md transition-shadow">
      <div className="card-body">
        <div className="card-title">History</div>
        <div className="text-sm opacity-70 mb-1">
          How many days to pull data for the newsletter
        </div>

        <label className="form-control w-full max-w-xs">
          <input
            type="number"
            min={1}
            max={365}
            className="input input-bordered w-full max-w-xs"
            value={lookbackDays}
            onChange={(e) => {
              const v = Number(e.target.value || 1);
              const n = Math.max(1, Math.min(365, v | 0));
              if (n !== lookbackDays) save({ lookbackDays: n });
            }}
          />
          <span className="label-text-alt opacity-70 mt-1">
            1–365 days (defaults to 7 if unset)
          </span>
        </label>
      </div>
    </div>
  );
}
