import type { Delivery } from "@/lib/sim/run";

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

export function PayloadView({ delivery }: { delivery: Delivery }) {
  const dropped = delivery.ledger?.droppedFields ?? [];
  const wasDropped = (key: string) => dropped.some((d) => d === key || d.startsWith(`${key}.`));
  return (
    <section aria-labelledby="payload-title">
      <h3 id="payload-title">What the webhook carried</h3>
      <p className="assumed-note" data-testid="assumed-label">
        Assumed format. <a href="#assumed">OptiMantra doesn’t publish its webhook fields</a>, so these names change once we capture a real one.
      </p>
      <dl className="payload" data-testid="payload">
        {Object.entries(delivery.payload).map(([key, value]) => (
          <div key={key} className={wasDropped(key) ? "dropped" : undefined} data-dropped={wasDropped(key) || undefined}>
            <dt>{key}</dt>
            <dd>{wasDropped(key) ? <s>{show(value)}</s> : show(value)}</dd>
          </div>
        ))}
      </dl>
      {dropped.length > 0 && <p className="quiet">Struck-through fields were removed on arrival. Only their names are kept in the ledger.</p>}
    </section>
  );
}
