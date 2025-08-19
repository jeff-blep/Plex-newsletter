// src/components/RecipientsCard.tsx
import React from "react";

type Props = {
  config: any;
  save: (partial: any) => Promise<void> | void;
};

export default function RecipientsCard({ config, save }: Props) {
  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <div className="flex items-center justify-between">
          <h2 className="card-title">Recipients</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              const name = prompt("Recipient name?") || "";
              const email = prompt("Recipient email?") || "";
              if (!email) return;
              save({ recipients: [...(config.recipients || []), { name, email }] });
            }}
          >
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
                        <button
                          className="btn btn-ghost join-item"
                          onClick={() => {
                            const nr = [...config.recipients];
                            const name = prompt("Name:", r.name || "") ?? r.name;
                            const email = prompt("Email:", r.email || "") ?? r.email;
                            nr[i] = { name, email };
                            save({ recipients: nr });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-error join-item"
                          onClick={() => {
                            const nr = [...(config.recipients || [])];
                            nr.splice(i, 1);
                            save({ recipients: nr });
                          }}
                        >
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
  );
}
