import type { Delivery } from "@/lib/sim/run";

type PointState = "done" | "skip" | "flag" | "idle";
type Point = { name: string; detail: string; state: PointState };

const MATCH_LABELS: Record<string, string> = {
  phone: "By phone",
  email: "By email",
  new_contact: "New contact",
  existing_by_upsert: "Found on save",
  ledger: "From the ledger",
  fuzzy_flagged: "Unclear",
};

const OUTCOME_LABELS: Record<string, string> = {
  applied: "Applied",
  ignored: "Ignored",
  duplicate: "Duplicate",
  needs_review: "Needs review",
  rejected: "Rejected",
  failed: "Failed",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function pointsFor(delivery?: Delivery): Point[] {
  const idle = (name: string): Point => ({ name, detail: "", state: "idle" });
  const row = delivery?.ledger;
  if (!row) return ["Received", "Cleaned", "Matched", "Changed", "Logged"].map(idle);

  const review = row.outcome === "needs_review";
  const removed = row.droppedFields.length;
  const changes = row.actions.length;
  return [
    { name: "Received", detail: row.eventType ? `Appointment ${row.eventType}` : "Webhook", state: "done" },
    { name: "Cleaned", detail: removed ? `${plural(removed, "field")} removed` : "Nothing to remove", state: "done" },
    {
      name: "Matched",
      detail: row.matchMethod ? MATCH_LABELS[row.matchMethod] : review ? "No safe match" : "Not needed",
      state: row.matchMethod === "fuzzy_flagged" || (review && !row.matchMethod) ? "flag" : row.matchMethod ? "done" : "skip",
    },
    { name: "Changed", detail: changes ? plural(changes, "change") : "No changes", state: changes ? "done" : "skip" },
    { name: "Logged", detail: OUTCOME_LABELS[row.outcome], state: review || row.outcome === "failed" ? "flag" : "done" },
  ];
}

/** The path a webhook takes through the sync, drawn as points along one line. */
export function Meridian({ delivery, label }: { delivery?: Delivery; label?: string }) {
  const points = pointsFor(delivery);
  return (
    <figure className="meridian" data-testid={delivery ? "meridian" : undefined}>
      {label && <figcaption>{label}</figcaption>}
      <ol>
        {points.map((p, i) => (
          <li key={p.name} className={`point ${p.state}`} style={{ "--i": i } as React.CSSProperties}>
            <span className="dot" aria-hidden="true" />
            <strong>{p.name}</strong>
            <span>{p.detail}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
