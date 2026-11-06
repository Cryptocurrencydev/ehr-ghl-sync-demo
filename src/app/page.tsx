import { Simulator } from "@/components/Simulator";
import { SCENARIOS } from "@/lib/sim/scenarios";

const ASSUMED = [
  "OptiMantra’s field names, except apptDate",
  "The status values for booked, rescheduled and cancelled",
  "That cancellations and reschedules send a webhook at all",
  "That each appointment has a stable id",
];
const PUBLISHED = [
  "HighLevel’s endpoints, request bodies and token types",
  "OptiMantra has outbound webhooks and lets you choose the fields",
  "OptiMantra’s setup guide defaults to PUT and shows no signing option",
  "A third-party guide names apptDate and its long date format",
];
const UNTESTED = [
  "Nothing here has run against a real HighLevel account",
  "Nothing here has received a real OptiMantra webhook",
  "Both happen during discovery, before any patient data moves",
];

function Column({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  return (
    <main className="page">
      <header className="masthead">
        <p className="brand">Lumen Acupuncture, Lakeside and Northfield</p>
        <h1>See what happens in HighLevel when the EHR books a consult</h1>
        <p className="lede">
          OptiMantra stays the only calendar. Pick something that happens at the front desk, and the real sync code runs it against a mock HighLevel account.
        </p>
      </header>

      <Simulator scenarios={SCENARIOS} />

      <section className="assumptions" id="assumed" aria-labelledby="assumed-title">
        <h2 id="assumed-title">What’s assumed and what’s checked</h2>
        <div className="assumption-grid">
          <Column title="Assumed until we see a real webhook" items={ASSUMED} />
          <Column title="Checked against published docs" items={PUBLISHED} />
          <Column title="Not tested yet" items={UNTESTED} />
        </div>
      </section>
    </main>
  );
}
