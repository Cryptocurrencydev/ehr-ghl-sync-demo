// One entry point for a webhook delivery: authenticate, parse, strip, sync.
// The HTTP route and the simulator both go through `receiveWebhook`.
import { timingSafeEqual, createHash } from "node:crypto";
import { adaptOptiMantra } from "./optimantra-adapter";
import { syncEvent, type SyncDeps } from "./engine";
import type { LedgerRow } from "./types";

const MAX_BODY_BYTES = 64 * 1024;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** OptiMantra's public docs show no signing option, so the URL itself carries the secret. */
export function secretMatches(given: string, expected: string | undefined) {
  return Boolean(expected) && timingSafeEqual(digest(given), digest(expected as string));
}

/** An empty allowlist allows everyone: OptiMantra's source IPs still have to be confirmed. */
export function ipAllowed(ip: string | null, allowlist: string | undefined) {
  const allowed = (allowlist ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.length === 0 || (ip !== null && allowed.includes(ip));
}

export type Delivery = { pathSecret: string; ip: string | null; rawBody: string };
export type WebhookAuth = { secret: string | undefined; ipAllowlist?: string };
export type WebhookResult = { httpStatus: number; ledger: LedgerRow | null };

export async function receiveWebhook(deps: SyncDeps, auth: WebhookAuth, delivery: Delivery): Promise<WebhookResult> {
  // No ledger row for these: anyone on the internet could otherwise fill the table.
  if (!secretMatches(delivery.pathSecret, auth.secret)) return { httpStatus: 404, ledger: null };
  if (!ipAllowed(delivery.ip, auth.ipAllowlist)) return { httpStatus: 403, ledger: null };

  if (Buffer.byteLength(delivery.rawBody) > MAX_BODY_BYTES) {
    return { httpStatus: 413, ledger: await deps.store.writeLedger({ outcome: "rejected", reason: "Payload too large" }) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(delivery.rawBody);
  } catch {
    return { httpStatus: 400, ledger: await deps.store.writeLedger({ outcome: "rejected", reason: "Payload is not valid JSON" }) };
  }

  const adapted = adaptOptiMantra(parsed);
  if (!adapted.ok) {
    return { httpStatus: 422, ledger: await deps.store.writeLedger({ outcome: "rejected", reason: adapted.reason, droppedFields: adapted.droppedFields }) };
  }
  return syncEvent(deps, adapted.event, adapted.droppedFields);
}
