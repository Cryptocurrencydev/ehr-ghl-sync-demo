// Runs one scenario through the real webhook code, against a fresh mock HighLevel.
// Each run has its own run id, so any scenario can be repeated from a clean start.
import { randomUUID } from "node:crypto";
import { MockGhl, type GhlCall, type MockState } from "../ghl/mock";
import { defaultConfig, type SyncConfig } from "../sync/config";
import { SyncStore } from "../sync/store";
import type { LedgerRow } from "../sync/types";
import { receiveWebhook } from "../sync/webhook";
import { SCENARIOS } from "./scenarios";
import { seedState, STAGE_LABELS, WORKFLOW_LABELS } from "./seed";

export type OpportunityView = {
  id: string;
  pipeline: string;
  pipelineKind: "organic" | "paid";
  stage: string;
  status: string;
  source: string;
  campaign: string | null;
  utm: string | null;
  consultTime: string | null;
};

export type ContactView = {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  workflows: string[];
  opportunities: OpportunityView[];
};

export type GhlView = { contacts: ContactView[]; contactCount: number; opportunityCount: number };

export type Delivery = { payload: Record<string, unknown>; httpStatus: number; ledger: LedgerRow | null };

export type RunResult = {
  runId: string;
  scenarioId: string;
  deliveries: Delivery[];
  before: GhlView;
  after: GhlView;
  /** HighLevel calls made by the scenario's own deliveries, setup excluded. */
  calls: GhlCall[];
};

function viewOf(config: SyncConfig, state: MockState, ids: string[]): GhlView {
  const pipelines = config.locations.flatMap((l) => (["organic", "paid"] as const).map((kind) => ({ kind, ...l.pipelines[kind] })));
  const field = (o: MockState["opportunities"][number], key: string) => o.customFields?.find((f) => f.key === key)?.fieldValue ?? null;
  return {
    contactCount: state.contacts.length,
    opportunityCount: state.opportunities.length,
    contacts: state.contacts
      .filter((c) => ids.includes(c.id))
      .map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        phone: c.phone ?? "",
        email: c.email ?? "",
        tags: c.tags ?? [],
        workflows: c.activeWorkflows.map((w) => WORKFLOW_LABELS[w] ?? w),
        opportunities: state.opportunities
          .filter((o) => o.contactId === c.id)
          .map((o) => {
            const pipeline = pipelines.find((p) => p.id === o.pipelineId);
            const a = o.attribution;
            return {
              id: o.id,
              pipeline: pipeline?.name ?? o.pipelineId,
              pipelineKind: pipeline?.kind ?? "organic",
              stage: STAGE_LABELS[o.pipelineStageId] ?? o.pipelineStageId,
              status: o.status,
              source: o.source ?? field(o, config.customFields.bookingSource) ?? "None",
              campaign: a?.campaign ?? null,
              utm: a?.utmSource ? `${a.utmSource} / ${a.utmMedium ?? "none"}` : null,
              consultTime: field(o, config.customFields.consultTime),
            };
          }),
      })),
  };
}

export async function runScenario(scenarioId: string, workspace: string, config: SyncConfig = defaultConfig): Promise<RunResult | null> {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return null;

  const runId = randomUUID();
  const mock = new MockGhl(seedState());
  const deps = { config, store: new SyncStore({ workspace, runId }), ghlFor: () => mock };
  const auth = { secret: runId };
  const send = (p: Record<string, unknown>) => receiveWebhook(deps, auth, { pathSecret: runId, ip: null, rawBody: JSON.stringify(p) });

  for (const p of scenario.setup) await send(p);

  const beforeState = mock.snapshot();
  const callsBefore = mock.calls.length;
  const deliveries: Delivery[] = [];
  for (const p of scenario.fire) deliveries.push({ payload: p, ...(await send(p)) });
  const afterState = mock.snapshot();

  const created = afterState.contacts.filter((c) => !beforeState.contacts.some((b) => b.id === c.id)).map((c) => c.id);
  return {
    runId,
    scenarioId,
    deliveries,
    before: viewOf(config, beforeState, scenario.focusContactIds),
    after: viewOf(config, afterState, [...scenario.focusContactIds, ...created]),
    calls: mock.calls.slice(callsBefore),
  };
}
