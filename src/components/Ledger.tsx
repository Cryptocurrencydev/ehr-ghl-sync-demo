import type { LedgerRow } from "@/lib/sync/types";
import { formatTime } from "./Comparison";

const OUTCOMES: Record<string, string> = {
  applied: "Applied",
  ignored: "Ignored",
  duplicate: "Duplicate",
  needs_review: "Needs review",
  rejected: "Rejected",
  failed: "Failed",
};

export function Ledger({ rows }: { rows: LedgerRow[] }) {
  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <h2 id="ledger-title">Sync ledger</h2>
      <p className="lede-small">Every event writes one row to Postgres. Rows carry no names, phone numbers or emails.</p>
      {rows.length === 0 ? (
        <p className="quiet" data-testid="ledger-empty">Your runs appear here. Rows are removed after a day.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="ledger-title">
          <table data-testid="ledger">
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">Appointment</th>
                <th scope="col">Event</th>
                <th scope="col">Outcome</th>
                <th scope="col">What happened</th>
                <th scope="col">Fields removed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.outcome}>
                  <td>{formatTime(r.receivedAt)}</td>
                  <td>{r.appointmentId ?? "Unknown"}<br /><small>{r.location ?? "No location"}</small></td>
                  <td>{r.eventType ?? "None"}</td>
                  <td><span className="outcome">{OUTCOMES[r.outcome]}</span></td>
                  <td>{r.reason ?? r.actions.join(". ")}</td>
                  <td>{r.droppedFields.join(", ") || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
