export type EventKind = "booked" | "rescheduled" | "cancelled";

/** The only patient data that continues past the adapter. Notes, diagnosis and card data never reach this type. */
export type CleanEvent = {
  appointmentId: string;
  kind: EventKind;
  status: string;
  appointmentType: string;
  location: string;
  startsAt: string | null;
  occurredAt: string | null;
  firstName: string;
  lastName: string;
  /** E.164, or null when missing or unusable. */
  phone: string | null;
  /** Lowercased, or null when missing or unusable. */
  email: string | null;
};

export type Outcome = "applied" | "ignored" | "duplicate" | "needs_review" | "rejected" | "failed";
export type AppointmentCategory = "consult" | "treatment";
export type PipelineKind = "organic" | "paid";
export type MatchMethod = "phone" | "email" | "new_contact" | "existing_by_upsert" | "ledger" | "fuzzy_flagged";

export type Scope = { workspace: string; runId: string };

export type LedgerDraft = {
  location?: string | null;
  appointmentId?: string | null;
  appointmentCategory?: string | null;
  appointmentStartsAt?: string | null;
  appointmentStatus?: string | null;
  eventType?: string | null;
  idempotencyKey?: string | null;
  outcome: Outcome;
  matchMethod?: MatchMethod | null;
  ghlContactId?: string | null;
  ghlOpportunityId?: string | null;
  pipeline?: PipelineKind | null;
  actions?: string[];
  reason?: string | null;
  droppedFields?: string[];
};

export type LedgerRow = Required<LedgerDraft> & { id: string; receivedAt: string };

export type AppointmentState = {
  location: string;
  appointmentId: string;
  status: "booked" | "cancelled";
  startsAt: string | null;
  ghlContactId: string | null;
  ghlOpportunityId: string | null;
  pipeline: PipelineKind | null;
  lastEventAt: string | null;
};
