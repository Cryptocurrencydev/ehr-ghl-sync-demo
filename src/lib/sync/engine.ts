// The sync rules. The EHR stays the only calendar: this code reacts to its events and
// updates HighLevel's contact, opportunity, tags and workflows. It never writes back to the EHR.
import { GhlError, type GhlClient, type GhlOpportunity } from "../ghl/types";
import { categorise, findLocation, type LocationConfig, type SyncConfig } from "./config";
import { matchContact } from "./match";
import type { SyncStore, SyncTx } from "./store";
import type { AppointmentState, CleanEvent, EventKind, LedgerDraft, LedgerRow, PipelineKind } from "./types";

export type SyncDeps = {
  config: SyncConfig;
  store: SyncStore;
  ghlFor: (location: LocationConfig) => GhlClient;
};

type Ctx = { deps: SyncDeps; ghl: GhlClient; location: LocationConfig; event: CleanEvent; tx: SyncTx; existing: AppointmentState | null };

/** Appointment id + event type. Reschedules add the new time, so a second real move isn't taken for a repeat. */
export function idempotencyKey(appointmentId: string, kind: EventKind, startsAt: string | null) {
  return kind === "rescheduled" ? `${appointmentId}:rescheduled:${startsAt}` : `${appointmentId}:${kind}`;
}

function pipelineOf(location: LocationConfig, o: GhlOpportunity): PipelineKind | null {
  if (o.pipelineId === location.pipelines.organic.id) return "organic";
  if (o.pipelineId === location.pipelines.paid.id) return "paid";
  return null;
}

async function openOpportunities(ghl: GhlClient, location: LocationConfig, contactId: string) {
  const all = await ghl.searchOpportunities({ locationId: location.ghlLocationId, contactId, status: "open" });
  return all.filter((o) => pipelineOf(location, o));
}

function nextState(ctx: Ctx, over: Partial<AppointmentState>): AppointmentState {
  return {
    location: ctx.location.key,
    appointmentId: ctx.event.appointmentId,
    status: "booked",
    startsAt: ctx.event.startsAt,
    ghlContactId: ctx.existing?.ghlContactId ?? null,
    ghlOpportunityId: ctx.existing?.ghlOpportunityId ?? null,
    pipeline: ctx.existing?.pipeline ?? null,
    lastEventAt: ctx.event.occurredAt ?? ctx.existing?.lastEventAt ?? null,
    ...over,
  };
}

async function stopNurture({ ghl, location, deps }: Ctx, contactId: string, actions: string[]) {
  await ghl.addTags(contactId, [deps.config.bookedTag]);
  actions.push(`Added tag ${deps.config.bookedTag}`);
  const workflows = [...location.followUpWorkflowIds, ...(location.rebook.enabled ? [location.rebook.workflowId] : [])];
  for (const id of workflows) await ghl.removeFromWorkflow(contactId, id);
  actions.push(`Removed from ${workflows.length} follow-up workflows`);
}

async function book(ctx: Ctx): Promise<LedgerDraft> {
  const { ghl, location, event, deps, tx } = ctx;
  const { customFields, directBookingSource } = deps.config;
  const match = await matchContact(ghl, location.ghlLocationId, event);

  if (match.kind === "review") {
    await tx.saveAppointment(nextState(ctx, {}));
    return { outcome: "needs_review", matchMethod: match.fuzzy ? "fuzzy_flagged" : null, reason: `${match.reason}. Candidates: ${match.candidateIds.join(", ") || "none"}. Nothing changed in HighLevel.` };
  }

  const actions: string[] = [];
  let contactId: string;
  let matchMethod: LedgerDraft["matchMethod"];
  if (match.kind === "matched") {
    contactId = match.contact.id;
    matchMethod = match.method;
  } else {
    // The search index can lag by a few seconds, so upsert rather than create. It finds a
    // contact the search missed instead of duplicating it.
    const { contact, isNew } = await ghl.upsertContact({
      locationId: location.ghlLocationId,
      firstName: event.firstName,
      lastName: event.lastName,
      ...(event.phone ? { phone: event.phone } : {}),
      ...(event.email ? { email: event.email } : {}),
      source: directBookingSource,
    });
    contactId = contact.id;
    matchMethod = isNew ? "new_contact" : "existing_by_upsert";
    if (isNew) actions.push("Created contact");
  }

  const open = await openOpportunities(ghl, location, contactId);
  const consultTime = { key: customFields.consultTime, fieldValue: event.startsAt as string };

  if (open.length > 1) {
    // The contact is certain, so nurture stops, but which opportunity owns this booking is a person's call.
    await stopNurture(ctx, contactId, actions);
    await tx.saveAppointment(nextState(ctx, { ghlContactId: contactId }));
    return {
      outcome: "needs_review", matchMethod, ghlContactId: contactId, actions,
      reason: `Contact has ${open.length} open opportunities: ${open.map((o) => o.id).join(", ")}. No opportunity was moved.`,
    };
  }

  let opportunityId: string;
  let pipeline: PipelineKind;
  if (open.length === 1) {
    const [opportunity] = open;
    pipeline = pipelineOf(location, opportunity) as PipelineKind;
    opportunityId = opportunity.id;
    await ghl.updateOpportunity(opportunity.id, { pipelineStageId: location.pipelines[pipeline].stages.consultBooked, customFields: [consultTime] });
    actions.push(`Moved opportunity to Consult Booked in ${location.pipelines[pipeline].name}`);
  } else {
    pipeline = "organic";
    const created = await ghl.createOpportunity({
      locationId: location.ghlLocationId,
      pipelineId: location.pipelines.organic.id,
      pipelineStageId: location.pipelines.organic.stages.consultBooked,
      contactId,
      name: `${event.firstName} ${event.lastName}`.trim() + ` - ${location.displayName} consult`,
      status: "open",
      customFields: [consultTime, { key: customFields.bookingSource, fieldValue: directBookingSource }],
    });
    opportunityId = created.id;
    actions.push(`Created opportunity in ${location.pipelines.organic.name} at Consult Booked`);
  }

  await stopNurture(ctx, contactId, actions);
  await tx.saveAppointment(nextState(ctx, { ghlContactId: contactId, ghlOpportunityId: opportunityId, pipeline }));
  return { outcome: "applied", matchMethod, ghlContactId: contactId, ghlOpportunityId: opportunityId, pipeline, actions };
}

async function reschedule(ctx: Ctx, key: string): Promise<LedgerDraft> {
  const { ghl, location, event, deps, tx, existing } = ctx;
  if (!existing) return book(ctx);
  if (existing.status === "cancelled") return { outcome: "needs_review", reason: "Reschedule arrived for an appointment already cancelled. HighLevel was left as it is." };

  await tx.forgetOtherReschedules(event.appointmentId, key);
  if (!existing.ghlOpportunityId || !existing.ghlContactId) {
    await tx.saveAppointment(nextState(ctx, {}));
    return { outcome: "needs_review", reason: "Reschedule for a booking that was never matched. New time saved in the ledger only." };
  }

  const open = await openOpportunities(ghl, location, existing.ghlContactId);
  const ids = { ghlContactId: existing.ghlContactId, ghlOpportunityId: existing.ghlOpportunityId, pipeline: existing.pipeline, matchMethod: "ledger" as const };
  await tx.saveAppointment(nextState(ctx, {}));
  if (!open.some((o) => o.id === existing.ghlOpportunityId)) return { outcome: "ignored", ...ids, reason: "Opportunity is no longer open, so it was left alone." };

  await ghl.updateOpportunity(existing.ghlOpportunityId, { customFields: [{ key: deps.config.customFields.consultTime, fieldValue: event.startsAt as string }] });
  return { outcome: "applied", ...ids, actions: ["Updated consult time, stage unchanged"] };
}

async function cancel(ctx: Ctx): Promise<LedgerDraft> {
  const { ghl, location, event, deps, tx, existing } = ctx;
  if (!existing) {
    await tx.saveAppointment(nextState(ctx, { status: "cancelled" }));
    return { outcome: "ignored", reason: "Cancellation arrived before any booking. Held, so a late booking event can't revive it." };
  }
  const state = nextState(ctx, { status: "cancelled", startsAt: event.startsAt ?? existing.startsAt });
  await tx.saveAppointment(state);

  if (!existing.ghlOpportunityId || !existing.ghlContactId || !existing.pipeline) {
    return { outcome: "needs_review", reason: "Cancellation for a booking that was never matched. Nothing changed in HighLevel." };
  }
  const ids = { ghlContactId: existing.ghlContactId, ghlOpportunityId: existing.ghlOpportunityId, pipeline: existing.pipeline, matchMethod: "ledger" as const };

  if (await tx.hasOtherActiveAppointment(existing.ghlOpportunityId, event.appointmentId)) {
    return { outcome: "ignored", ...ids, reason: "Patient has another active consult on this opportunity, so the stage stays at Consult Booked." };
  }
  const opportunity = (await openOpportunities(ghl, location, existing.ghlContactId)).find((o) => o.id === existing.ghlOpportunityId);
  if (!opportunity) return { outcome: "ignored", ...ids, reason: "Opportunity is no longer open, so it was left alone." };

  const stages = location.pipelines[existing.pipeline].stages;
  if (opportunity.pipelineStageId !== stages.consultBooked) {
    return { outcome: "needs_review", ...ids, reason: "Opportunity has moved past Consult Booked, so staff should decide what the cancellation means." };
  }

  const actions = [`Moved opportunity to Consult Cancelled in ${location.pipelines[existing.pipeline].name}`];
  await ghl.updateOpportunity(existing.ghlOpportunityId, { pipelineStageId: stages.consultCancelled });
  await ghl.removeTags(existing.ghlContactId, [deps.config.bookedTag]);
  actions.push(`Removed tag ${deps.config.bookedTag}`);
  if (location.rebook.enabled) {
    await ghl.addToWorkflow(existing.ghlContactId, location.rebook.workflowId);
    actions.push("Started re-book sequence");
  }
  return { outcome: "applied", ...ids, actions };
}

async function decide(ctx: Ctx, category: string | null): Promise<LedgerDraft> {
  const { event, existing, tx } = ctx;
  const movedTime = existing?.status === "booked" && existing.startsAt !== event.startsAt;
  const kind: EventKind = event.kind === "booked" && movedTime ? "rescheduled" : event.kind;
  const key = idempotencyKey(event.appointmentId, kind, event.startsAt);
  const base = { eventType: kind, idempotencyKey: key };

  const stale = Boolean(existing?.lastEventAt && event.occurredAt && event.occurredAt < existing.lastEventAt);
  // Checked before claiming, so a late replay of an old time can't use up the key for a real move back to it.
  if (stale && kind === "rescheduled") return { ...base, outcome: "ignored", reason: "Event is older than the latest one applied to this appointment." };

  if (!(await tx.claim(key, event.appointmentId))) return { ...base, outcome: "duplicate", reason: "Already processed this delivery. Nothing changed." };

  if (category === "treatment") return { ...base, outcome: "ignored", reason: "Existing-patient treatment. Nothing sent to HighLevel." };
  if (!category) return { ...base, outcome: "needs_review", reason: "Appointment type isn't mapped to consult or treatment. Nothing sent to HighLevel." };

  if (stale) return { ...base, outcome: "ignored", reason: "Event is older than the latest one applied to this appointment." };
  if (kind === "booked" && existing?.status === "cancelled" && !event.occurredAt) {
    return { ...base, outcome: "needs_review", reason: "Booking arrived after a cancellation with no timestamp to order them. The cancellation stands." };
  }
  if (kind === "booked" && existing?.status === "booked") return { ...base, outcome: "ignored", reason: "Appointment is already booked at this time." };

  const draft = kind === "booked" ? await book(ctx) : kind === "rescheduled" ? await reschedule(ctx, key) : await cancel(ctx);
  return { ...base, ...draft };
}

export type SyncResult = { httpStatus: number; ledger: LedgerRow };

export async function syncEvent(deps: SyncDeps, event: CleanEvent, droppedFields: string[]): Promise<SyncResult> {
  const location = findLocation(deps.config, event.location);
  const category = categorise(deps.config, event.appointmentType);
  const base: LedgerDraft = {
    outcome: "failed",
    location: location?.key ?? null,
    appointmentId: event.appointmentId,
    appointmentCategory: category ?? "unmapped",
    appointmentStartsAt: event.startsAt,
    appointmentStatus: event.status,
    eventType: event.kind,
    droppedFields,
  };

  if (!location) {
    return { httpStatus: 200, ledger: await deps.store.writeLedger({ ...base, outcome: "needs_review", reason: "Location isn't in the routing config. Nothing sent to HighLevel." }) };
  }

  // Locked by person as well as appointment, so two bookings for one new patient can't both create them.
  const lockKeys = [`appt:${location.key}:${event.appointmentId}`, `person:${location.key}:${event.phone ?? event.email ?? event.appointmentId}`];
  try {
    const ledger = await deps.store.withLock(lockKeys, async (tx) => {
      const existing = await tx.getAppointment(location.key, event.appointmentId);
      const draft = await decide({ deps, ghl: deps.ghlFor(location), location, event, tx, existing }, category);
      return tx.writeLedger({ ...base, ...draft });
    });
    return { httpStatus: 200, ledger };
  } catch (e) {
    // The rollback freed the idempotency claim, so a redelivery can finish the job. Every write
    // above is safe to repeat. The reason holds a status code only, never a response body.
    const reason = e instanceof GhlError ? e.message : "Internal error while processing";
    return { httpStatus: 502, ledger: await deps.store.writeLedger({ ...base, outcome: "failed", reason }) };
  }
}
