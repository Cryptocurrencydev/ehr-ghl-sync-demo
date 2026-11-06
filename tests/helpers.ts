import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { MockGhl, type MockState } from "@/lib/ghl/mock";
import { seedState } from "@/lib/sim/seed";
import { payload } from "@/lib/sim/scenarios";
import { defaultConfig, type SyncConfig } from "@/lib/sync/config";
import { SyncStore } from "@/lib/sync/store";
import { receiveWebhook } from "@/lib/sync/webhook";

export function harness(seed: MockState = seedState(), config: SyncConfig = defaultConfig, latencyMs = 0) {
  const runId = randomUUID();
  const mock = new MockGhl(seed, latencyMs);
  const deps = { config, store: new SyncStore({ workspace: "test", runId }), ghlFor: () => mock };
  const send = async (p: Record<string, unknown>) => {
    const r = await receiveWebhook(deps, { secret: "s" }, { pathSecret: "s", ip: null, rawBody: JSON.stringify(p) });
    return { httpStatus: r.httpStatus, row: r.ledger! };
  };
  const opp = (id: string) => mock.snapshot().opportunities.find((o) => o.id === id)!;
  const contact = (id: string) => mock.snapshot().contacts.find((c) => c.id === id)!;
  return { runId, mock, deps, send, opp, contact };
}

export const maya = { apptId: "A-1", firstName: "Maya", lastName: "Lindqvist", phone: "(415) 555-0111", email: "maya.lindqvist@example.com" };
export const owen = { apptId: "A-2", firstName: "Owen", lastName: "Mercer", phone: "(415) 555-0100", email: "owen.mercer@example.com" };
export const book = (p: Parameters<typeof payload>[0]) => payload(p);
export const cancelled = (p: Parameters<typeof payload>[0], updatedAt = "2026-11-06T16:00:00.000Z") => payload({ ...p, apptStatus: "Cancelled", updatedAt });
export const moved = (p: Parameters<typeof payload>[0], apptDate: string, updatedAt = "2026-11-06T16:00:00.000Z") => payload({ ...p, apptStatus: "Rescheduled", apptDate, updatedAt });

/** Every row the database holds, as one string, for checking what was never stored. */
export async function databaseDump() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const parts: unknown[] = [];
  for (const t of ["ledger", "processed_events", "appointments"]) parts.push((await c.query(`select * from ${t}`)).rows);
  await c.end();
  return JSON.stringify(parts);
}
