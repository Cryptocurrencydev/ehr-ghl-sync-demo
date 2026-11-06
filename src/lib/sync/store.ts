import { Pool, type PoolClient } from "pg";
import type { AppointmentState, LedgerDraft, LedgerRow, Scope } from "./types";

type Queryable = Pick<PoolClient, "query">;

let sharedPool: Pool | undefined;

function pool() {
  if (!sharedPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
    sharedPool = new Pool({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 15_000 });
  }
  return sharedPool;
}

export async function closePool() {
  await sharedPool?.end();
  sharedPool = undefined;
}

function toLedgerRow(r: Record<string, unknown>): LedgerRow {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(r.id),
    receivedAt: iso(r.received_at) as string,
    location: r.location as string | null,
    appointmentId: r.appointment_id as string | null,
    appointmentCategory: r.appointment_category as string | null,
    appointmentStartsAt: iso(r.appointment_starts_at),
    appointmentStatus: r.appointment_status as string | null,
    eventType: r.event_type as string | null,
    idempotencyKey: r.idempotency_key as string | null,
    outcome: r.outcome as LedgerRow["outcome"],
    matchMethod: r.match_method as LedgerRow["matchMethod"],
    ghlContactId: r.ghl_contact_id as string | null,
    ghlOpportunityId: r.ghl_opportunity_id as string | null,
    pipeline: r.pipeline as LedgerRow["pipeline"],
    actions: r.actions as string[],
    reason: r.reason as string | null,
    droppedFields: r.dropped_fields as string[],
  };
}

async function insertLedger(db: Queryable, scope: Scope, d: LedgerDraft) {
  const { rows } = await db.query(
    `insert into ledger (workspace, run_id, location, appointment_id, appointment_category, appointment_starts_at, appointment_status,
       event_type, idempotency_key, outcome, match_method, ghl_contact_id, ghl_opportunity_id, pipeline, actions, reason, dropped_fields)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
    [
      scope.workspace, scope.runId, d.location ?? null, d.appointmentId ?? null, d.appointmentCategory ?? null, d.appointmentStartsAt ?? null,
      d.appointmentStatus ?? null, d.eventType ?? null, d.idempotencyKey ?? null, d.outcome, d.matchMethod ?? null, d.ghlContactId ?? null,
      d.ghlOpportunityId ?? null, d.pipeline ?? null, JSON.stringify(d.actions ?? []), d.reason ?? null, d.droppedFields ?? [],
    ],
  );
  return toLedgerRow(rows[0]);
}

/** Store calls that run inside one event's transaction. */
export class SyncTx {
  constructor(private readonly db: Queryable, private readonly scope: Scope) {}

  /** True for the first delivery of a key. Rolled back with the transaction if the work fails. */
  async claim(key: string, appointmentId: string) {
    const { rowCount } = await this.db.query(
      "insert into processed_events (run_id, idempotency_key, appointment_id) values ($1,$2,$3) on conflict do nothing",
      [this.scope.runId, key, appointmentId],
    );
    return rowCount === 1;
  }

  /** Lets a patient move back to an earlier time without that reschedule looking like a duplicate. */
  async forgetOtherReschedules(appointmentId: string, keepKey: string) {
    await this.db.query(
      "delete from processed_events where run_id = $1 and appointment_id = $2 and idempotency_key like '%:rescheduled:%' and idempotency_key <> $3",
      [this.scope.runId, appointmentId, keepKey],
    );
  }

  async getAppointment(location: string, appointmentId: string): Promise<AppointmentState | null> {
    const { rows } = await this.db.query("select * from appointments where run_id = $1 and location = $2 and appointment_id = $3", [this.scope.runId, location, appointmentId]);
    const r = rows[0];
    if (!r) return null;
    return {
      location: r.location,
      appointmentId: r.appointment_id,
      status: r.status,
      startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
      ghlContactId: r.ghl_contact_id,
      ghlOpportunityId: r.ghl_opportunity_id,
      pipeline: r.pipeline,
      lastEventAt: r.last_event_at ? new Date(r.last_event_at).toISOString() : null,
    };
  }

  async saveAppointment(a: AppointmentState) {
    await this.db.query(
      `insert into appointments (run_id, location, appointment_id, status, starts_at, ghl_contact_id, ghl_opportunity_id, pipeline, last_event_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (run_id, location, appointment_id) do update set status = excluded.status, starts_at = excluded.starts_at,
         ghl_contact_id = excluded.ghl_contact_id, ghl_opportunity_id = excluded.ghl_opportunity_id, pipeline = excluded.pipeline,
         last_event_at = excluded.last_event_at, updated_at = now()`,
      [this.scope.runId, a.location, a.appointmentId, a.status, a.startsAt, a.ghlContactId, a.ghlOpportunityId, a.pipeline, a.lastEventAt],
    );
  }

  /** True when another live appointment still relies on this opportunity. */
  async hasOtherActiveAppointment(opportunityId: string, appointmentId: string) {
    const { rowCount } = await this.db.query(
      "select 1 from appointments where run_id = $1 and ghl_opportunity_id = $2 and appointment_id <> $3 and status = 'booked'",
      [this.scope.runId, opportunityId, appointmentId],
    );
    return (rowCount ?? 0) > 0;
  }

  writeLedger(draft: LedgerDraft) {
    return insertLedger(this.db, this.scope, draft);
  }
}

export class SyncStore {
  constructor(readonly scope: Scope) {}

  /**
   * Runs one event in a transaction, holding advisory locks so simultaneous deliveries for
   * the same appointment or person queue up. Transaction-level locks work through Neon's pooler.
   */
  async withLock<T>(lockKeys: string[], fn: (tx: SyncTx) => Promise<T>): Promise<T> {
    const client = await pool().connect();
    try {
      await client.query("begin");
      for (const key of [...new Set(lockKeys)].sort()) {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`${this.scope.runId}:${key}`]);
      }
      const result = await fn(new SyncTx(client, this.scope));
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  /** For rows outside the event transaction: rejections and failures. */
  writeLedger(draft: LedgerDraft) {
    return insertLedger(pool(), this.scope, draft);
  }
}

export async function listLedger(workspace: string, limit = 60) {
  const { rows } = await pool().query("select * from ledger where workspace = $1 order by id desc limit $2", [workspace, limit]);
  return rows.map(toLedgerRow);
}

/** Simulator rows are disposable. Real rows, under the `webhook` workspace, are never touched. */
export async function pruneSimulatorData() {
  await pool().query(
    `with old as (delete from ledger where workspace <> 'webhook' and received_at < now() - interval '1 day' returning run_id),
     e as (delete from processed_events where run_id <> 'live' and created_at < now() - interval '1 day')
     delete from appointments where run_id <> 'live' and updated_at < now() - interval '1 day'`,
  );
}
