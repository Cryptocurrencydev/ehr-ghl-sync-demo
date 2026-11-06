// ASSUMED PAYLOAD. OptiMantra does not publish its webhook schema, so this is the one file
// to change once a real payload is captured during discovery.
//
// Publicly documented: outbound webhooks exist, PUT is the default method, fields are selectable.
// Seen in a third-party tutorial only: `apptDate`, as a long human-readable date string.
// Everything else below is a placeholder name.
import { minimise } from "./minimise";
import { normaliseEmail, normalisePhone } from "./normalise";
import type { CleanEvent, EventKind } from "./types";

const FIELDS = {
  appointmentId: "apptId",
  startsAt: "apptDate",
  appointmentType: "apptType",
  status: "apptStatus",
  location: "locationName",
  firstName: "firstName",
  lastName: "lastName",
  phone: "phone",
  email: "email",
  occurredAt: "updatedAt",
} as const;

const STATUS_TO_KIND: Record<string, EventKind> = {
  booked: "booked",
  scheduled: "booked",
  confirmed: "booked",
  rescheduled: "rescheduled",
  cancelled: "cancelled",
  canceled: "cancelled",
};

export type AdaptResult =
  | { ok: true; event: CleanEvent; droppedFields: string[] }
  | { ok: false; reason: string; droppedFields: string[] };

const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

function toIso(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function adaptOptiMantra(raw: unknown): AdaptResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "Payload is not a JSON object", droppedFields: [] };

  const { kept, droppedFields } = minimise(raw as Record<string, unknown>, Object.values(FIELDS));
  const appointmentId = text(kept[FIELDS.appointmentId]);
  const status = text(kept[FIELDS.status]).toLowerCase();
  const kind = STATUS_TO_KIND[status];
  const appointmentType = text(kept[FIELDS.appointmentType]);
  const location = text(kept[FIELDS.location]);
  const startsAt = toIso(kept[FIELDS.startsAt]);

  const missing = [
    !appointmentId && FIELDS.appointmentId,
    !kind && FIELDS.status,
    !appointmentType && FIELDS.appointmentType,
    !location && FIELDS.location,
    kind !== "cancelled" && !startsAt && FIELDS.startsAt,
  ].filter(Boolean);
  if (missing.length) return { ok: false, reason: `Missing or unreadable fields: ${missing.join(", ")}`, droppedFields };

  return {
    ok: true,
    droppedFields,
    event: {
      appointmentId,
      kind,
      status,
      appointmentType,
      location,
      startsAt,
      occurredAt: toIso(kept[FIELDS.occurredAt]),
      firstName: text(kept[FIELDS.firstName]),
      lastName: text(kept[FIELDS.lastName]),
      phone: normalisePhone(kept[FIELDS.phone]),
      email: normaliseEmail(kept[FIELDS.email]),
    },
  };
}
