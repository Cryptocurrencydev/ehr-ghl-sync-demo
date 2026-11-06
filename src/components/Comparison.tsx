import type { ContactView, GhlView, OpportunityView } from "@/lib/sim/run";

export const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not set";

type Row = { label: string; value: string };

function opportunityRows(o: OpportunityView): Row[] {
  return [
    { label: "Pipeline", value: o.pipeline },
    { label: "Stage", value: o.stage },
    { label: "Consult time", value: formatTime(o.consultTime) },
    { label: "Source", value: o.source },
    { label: "Campaign", value: o.campaign ?? "None" },
    { label: "UTM", value: o.utm ?? "None" },
  ];
}

function contactRows(c: ContactView): Row[] {
  return [
    { label: "Phone", value: c.phone },
    { label: "Email", value: c.email },
    { label: "Tags", value: c.tags.join(", ") || "None" },
    { label: "Follow-up running", value: c.workflows.join(", ") || "None" },
  ];
}

function Rows({ rows, compare }: { rows: Row[]; compare?: Row[] }) {
  return (
    <dl>
      {rows.map((r) => {
        const changed = compare ? compare.find((c) => c.label === r.label)?.value !== r.value : false;
        return (
          <div key={r.label} className={changed ? "changed" : undefined} data-changed={changed || undefined}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Side({ title, view, compare, testId }: { title: string; view: GhlView; compare?: GhlView; testId: string }) {
  return (
    <section className="side" data-testid={testId}>
      <h3>{title}</h3>
      {view.contacts.length === 0 && <p className="quiet">No contact with this phone or email.</p>}
      {view.contacts.map((c) => {
        const prior = compare?.contacts.find((x) => x.id === c.id);
        return (
          <article key={c.id}>
            <h4>{c.name}</h4>
            <Rows rows={contactRows(c)} compare={compare ? (prior ? contactRows(prior) : []) : undefined} />
            {c.opportunities.length === 0 && <p className="quiet">No opportunity.</p>}
            {c.opportunities.map((o) => {
              const priorOpp = prior?.opportunities.find((x) => x.id === o.id);
              return (
                <div key={o.id} className={`opportunity ${o.pipelineKind}`}>
                  <Rows rows={opportunityRows(o)} compare={compare ? (priorOpp ? opportunityRows(priorOpp) : []) : undefined} />
                </div>
              );
            })}
          </article>
        );
      })}
      <p className="counts">
        {view.contactCount} contacts and {view.opportunityCount} opportunities in the mock account
      </p>
    </section>
  );
}

export function Comparison({ before, after }: { before: GhlView; after: GhlView }) {
  return (
    <div className="comparison">
      <Side title="HighLevel before" view={before} testId="before" />
      <Side title="HighLevel after" view={after} compare={before} testId="after" />
    </div>
  );
}
