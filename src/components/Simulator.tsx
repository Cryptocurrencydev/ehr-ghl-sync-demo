"use client";

import { useCallback, useEffect, useState } from "react";
import type { Delivery, GhlView, RunResult } from "@/lib/sim/run";
import type { Scenario } from "@/lib/sim/scenarios";
import type { LedgerRow } from "@/lib/sync/types";
import { Comparison } from "./Comparison";
import { Ledger } from "./Ledger";
import { Meridian } from "./Meridian";
import { PayloadView } from "./PayloadView";

export function Simulator({ scenarios }: { scenarios: Scenario[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);

  const loadLedger = useCallback(async () => {
    const res = await fetch("/api/ledger", { cache: "no-store" });
    if (res.ok) setLedger(((await res.json()) as { rows: LedgerRow[] }).rows);
  }, []);

  useEffect(() => {
    loadLedger().catch(() => {});
  }, [loadLedger]);

  async function run(id: string) {
    setActiveId(id);
    setRunning(id);
    setError(null);
    try {
      const res = await fetch("/api/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioId: id }) });
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as RunResult);
      await loadLedger();
    } catch {
      setResult(null);
      setError("The scenario didn’t finish because the ledger database didn’t respond. Run it again.");
    } finally {
      setRunning(null);
    }
  }

  const scenario = scenarios.find((s) => s.id === result?.scenarioId);

  return (
    <>
      <div className="workbench">
        <nav className="scenarios" aria-label="Scenarios">
          <h2>What happened?</h2>
          <ul>
            {scenarios.map((s) => (
              <li key={s.id}>
                <button type="button" data-testid={`run-${s.id}`} aria-pressed={activeId === s.id} disabled={running !== null} onClick={() => run(s.id)}>
                  <strong>{s.title}</strong>
                  <span>{running === s.id ? "Running…" : s.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="result" aria-live="polite" data-testid="result">
          {error && <p className="error" role="alert">{error}</p>}
          {!result && !error && (
            <div className="empty">
              <Meridian />
              <p>Choose a scenario to send its webhook through the sync.</p>
            </div>
          )}
          {result && scenario && <RunView key={result.runId} result={result} scenario={scenario} />}
        </section>
      </div>
      <Ledger rows={ledger} />
    </>
  );
}

function RunView({ result, scenario }: { result: RunResult; scenario: Scenario }) {
  return (
    <>
      <h2 data-testid="result-title">{scenario.title}</h2>
      <p className="takeaway">{scenario.takeaway}</p>

      <div className="traces">
        {result.deliveries.map((d: Delivery, i: number) => (
          <Meridian key={i} delivery={d} label={result.deliveries.length > 1 ? `Delivery ${i + 1}` : undefined} />
        ))}
      </div>

      <Comparison before={result.before as GhlView} after={result.after as GhlView} />

      <div className="evidence">
        <PayloadView delivery={result.deliveries.at(-1) as Delivery} />
        <section aria-labelledby="calls-title">
          <h3 id="calls-title">Calls to HighLevel</h3>
          {result.calls.length === 0 ? (
            <p className="quiet" data-testid="no-calls">No calls were made.</p>
          ) : (
            <ol className="calls" data-testid="calls">
              {result.calls.map((c, i) => (
                <li key={i}>
                  <b>{c.method}</b> <code>{c.path.split("?")[0]}</code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
