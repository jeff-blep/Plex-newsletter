// src/components/RecipientsCard.tsx
import React, { useRef, useState } from "react";

type Recipient = { name?: string; email: string };

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false, i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    } else {
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ",") { pushField(); i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { pushField(); pushRow(); i++; continue; }
      field += c; i++; continue;
    }
  }
  if (field.length || row.length) { pushField(); pushRow(); }
  if (rows.length && rows[rows.length - 1].every((x) => x.trim() === "")) rows.pop();
  return rows;
}

function normalizeRecipientsFromCsvRows(rows: string[][]): Recipient[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  let data = rows;
  const hasHeader =
    header.includes("email") ||
    (header.join(",").includes("name") && header.join(",").includes("email"));
  if (hasHeader) data = rows.slice(1);

  let iName = -1, iEmail = -1;
  if (hasHeader) {
    iName = header.findIndex((h) => ["name", "full name"].includes(h));
    iEmail = header.findIndex((h) => ["email", "email address"].includes(h));
  }

  return data
    .map((cols) => {
      const c = cols.map((x) => x?.trim() ?? "");
      let name = "", email = "";
      if (iEmail >= 0) email = c[iEmail] || "";
      if (iName >= 0) name = c[iName] || "";
      if (iEmail < 0 && c.length === 1) { email = c[0]; }
      if (iEmail < 0 && c.length >= 2) { name = c[0]; email = c[1]; }
      if (!email) return null;
      return { name, email };
    })
    .filter(Boolean) as Recipient[];
}

function dedupeKeepFirst(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of list) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export default function RecipientsCard({
  config,
  save,
}: {
  config: any;
  save: (partial: any) => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const recipients: Recipient[] = Array.isArray(config?.recipients)
    ? config.recipients
    : [];

  async function handleImportCsvFile(f: File) {
    setBusy(true);
    try {
      const text = await f.text();
      const rows = parseCsv(text);
      const parsed = normalizeRecipientsFromCsvRows(rows)
        .filter((r) => isValidEmail(r.email));
      if (!parsed.length) {
        (window as any).toast?.error?.("CSV had no valid rows (need Name,Email or Email)");
        return;
      }
      const merged = dedupeKeepFirst([
        ...recipients,
        ...parsed,
      ]);
      await save({ recipients: merged });
      (window as any).toast?.success?.(`Imported ${merged.length - recipients.length} new recipient(s)`);
    } catch (e: any) {
      (window as any).toast?.error?.("Import failed: " + (e?.message || e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleImportFromTautulli() {
    setBusy(true);
    try {
      const r = await fetch("http://localhost:5174/tautulli/users");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const fromT = Array.isArray(j?.users) ? j.users : [];
      const cleaned = fromT
        .map((u: any) => ({
          name: (u?.name || u?.username || u?.friendly_name || "").trim(),
          email: String(u?.email || "").trim(),
        }))
        .filter((u: Recipient) => isValidEmail(u.email));
      if (!cleaned.length) {
        (window as any).toast?.error?.("No emails found in Tautulli users.");
        return;
      }
      const merged = dedupeKeepFirst([...recipients, ...cleaned]);
      await save({ recipients: merged });
      (window as any).toast?.success?.(`Imported ${merged.length - recipients.length} from Tautulli`);
    } catch (e: any) {
      (window as any).toast?.error?.("Tautulli import failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    // CONTENT‑ONLY: no inner card, no title
    <div className="space-y-4">
      {/* Actions row (right aligned) */}
      <div className="flex items-center justify-end">
        <div className="join">
          {/* Import CSV */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportCsvFile(f);
            }}
          />
          <button
            className={`btn btn-ghost join-item ${busy ? "btn-disabled" : ""}`}
            onClick={() => fileRef.current?.click()}
          >
            Import CSV
          </button>

          {/* Import from Tautulli */}
          <button
            className={`btn join-item ${busy ? "btn-disabled" : ""}`}
            onClick={handleImportFromTautulli}
          >
            Import from Tautulli
          </button>

          {/* Add single */}
          <button
            className={`btn btn-primary join-item ${busy ? "btn-disabled" : ""}`}
            onClick={() => {
              const name = prompt("Recipient name?") || "";
              const email = prompt("Recipient email?") || "";
              if (!isValidEmail(email)) {
                (window as any).toast?.error?.("Please enter a valid email");
                return;
              }
              const merged = dedupeKeepFirst([...recipients, { name, email }]);
              save({ recipients: merged });
            }}
          >
            Add Recipient
          </button>
        </div>
      </div>

      {(!recipients || recipients.length === 0) ? (
        <div className="alert">
          <span>No recipients yet. Add or import to enable sending.</span>
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
              {recipients.map((r: Recipient, i: number) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.name || "-"}</td>
                  <td>{r.email}</td>
                  <td className="text-right">
                    <div className="join">
                      <button
                        className="btn btn-ghost join-item"
                        onClick={() => {
                          const nr = [...recipients];
                          const name = prompt("Name:", r.name || "") ?? r.name;
                          const email = prompt("Email:", r.email || "") ?? r.email;
                          if (!isValidEmail(String(email))) {
                            (window as any).toast?.error?.("Invalid email");
                            return;
                          }
                          nr[i] = { name: String(name || ""), email: String(email || "") };
                          save({ recipients: dedupeKeepFirst(nr) });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-error join-item"
                        onClick={() => {
                          const nr = [...recipients];
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

      <div className="opacity-70 text-xs">
        CSV format: <code>Name,Email</code> (header optional). Duplicates are removed by email.
      </div>
    </div>
  );
}
