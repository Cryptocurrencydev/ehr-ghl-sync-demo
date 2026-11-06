// Contact matching. Exact phone, then exact email. Anything less certain is flagged for a
// person to decide: this code never merges contacts and never guesses in a clinic's CRM.
import type { GhlClient, GhlContact } from "../ghl/types";
import type { CleanEvent } from "./types";

export type ContactMatch =
  | { kind: "matched"; contact: GhlContact; method: "phone" | "email" }
  | { kind: "none" }
  | { kind: "review"; reason: string; candidateIds: string[]; fuzzy?: boolean };

function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

function similarity(a: string, b: string) {
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - editDistance(a, b) / longest : 1;
}

/** True when two first names can't plausibly be the same person, such as relatives sharing a phone. */
export function firstNamesDiffer(a?: string | null, b?: string | null) {
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
  if (!x || !y) return false;
  // A shared start covers short forms like Kate and Katherine. Anything rarer goes to a person.
  return x.slice(0, 3) !== y.slice(0, 3) && similarity(x, y) < 0.5;
}

function isNearMiss(event: CleanEvent, contact: GhlContact) {
  if (!event.phone || !contact.phone) return false;
  const closeName = similarity(event.firstName.toLowerCase(), (contact.firstName ?? "").toLowerCase()) >= 0.6;
  return closeName && editDistance(event.phone, contact.phone) <= 2;
}

export async function matchContact(ghl: GhlClient, locationId: string, event: CleanEvent): Promise<ContactMatch> {
  if (!event.phone && !event.email) return { kind: "review", reason: "Booking has no usable phone or email", candidateIds: [] };

  const byPhone = event.phone ? await ghl.searchContacts(locationId, [{ field: "phone", operator: "eq", value: event.phone }]) : [];
  const byEmail = event.email ? await ghl.searchContacts(locationId, [{ field: "email", operator: "eq", value: event.email }]) : [];

  if (byPhone.length > 1) return { kind: "review", reason: `${byPhone.length} contacts share this phone`, candidateIds: byPhone.map((c) => c.id) };
  if (byPhone.length === 1) {
    const [contact] = byPhone;
    const other = byEmail.find((c) => c.id !== contact.id);
    if (other) return { kind: "review", reason: "Phone and email point to different contacts", candidateIds: [contact.id, other.id] };
    if (firstNamesDiffer(event.firstName, contact.firstName)) {
      return { kind: "review", reason: "Phone matches a contact with a different first name, possibly a relative", candidateIds: [contact.id] };
    }
    return { kind: "matched", contact, method: "phone" };
  }

  if (byEmail.length > 1) return { kind: "review", reason: `${byEmail.length} contacts share this email`, candidateIds: byEmail.map((c) => c.id) };
  if (byEmail.length === 1) {
    const [contact] = byEmail;
    if (firstNamesDiffer(event.firstName, contact.firstName)) {
      return { kind: "review", reason: "Email matches a contact with a different first name, possibly a relative", candidateIds: [contact.id] };
    }
    return { kind: "matched", contact, method: "email" };
  }

  if (event.lastName) {
    const sameSurname = await ghl.searchContacts(locationId, [{ field: "lastNameLowerCase", operator: "eq", value: event.lastName.toLowerCase() }]);
    const nearMisses = sameSurname.filter((c) => isNearMiss(event, c));
    if (nearMisses.length) {
      return { kind: "review", reason: "Similar name and nearly identical phone: may be the same person", candidateIds: nearMisses.map((c) => c.id), fuzzy: true };
    }
  }
  return { kind: "none" };
}
