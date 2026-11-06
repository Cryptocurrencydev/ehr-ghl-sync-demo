// Scenario definitions only, so the browser can import them without any server code.

const CONSULT = "New Patient Consultation";
export const TIMES = {
  first: "Tue Nov 17 2026 10:00:00 GMT-0600 (Central Standard Time)",
  moved: "Thu Nov 19 2026 15:30:00 GMT-0600 (Central Standard Time)",
};

type PayloadInput = {
  apptId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  apptType?: string;
  apptStatus?: string;
  locationName?: string;
  apptDate?: string;
  updatedAt?: string;
  [extra: string]: unknown;
};

/** A delivery in the assumed OptiMantra shape, with the extra fields a full-data webhook is likely to carry. */
export function payload(input: PayloadInput): Record<string, unknown> {
  const defaults = {
    apptType: CONSULT,
    apptStatus: "Booked",
    locationName: "Lakeside",
    apptDate: TIMES.first,
    updatedAt: "2026-11-06T15:00:00.000Z",
    providerName: "Dr. Mei Tan, L.Ac.",
    dateOfBirth: "1985-04-12",
  };
  // Spread twice so the patient's fields read first and still win over the defaults.
  return { ...input, ...defaults, ...input };
}

export type Scenario = {
  id: string;
  title: string;
  summary: string;
  /** What the owner should notice in the result. */
  takeaway: string;
  focusContactIds: string[];
  /** Delivered first, to reach the starting point. Not part of the before snapshot's changes. */
  setup: Record<string, unknown>[];
  /** The deliveries the scenario is about. */
  fire: Record<string, unknown>[];
};

const maya = { apptId: "OM-1001", firstName: "Maya", lastName: "Lindqvist", phone: "(415) 555-0111", email: "maya.lindqvist@example.com" };
const theo = { apptId: "OM-1002", firstName: "Theo", lastName: "Okafor", phone: "415.555.0122", email: "theo.okafor@example.com", locationName: "Northfield" };
const nadia = { apptId: "OM-1003", firstName: "Nadia", lastName: "Haddad", phone: "415-555-0199", email: "nadia.haddad@example.com" };
const priya = { apptId: "OM-1004", firstName: "Priya", lastName: "Raman", phone: "+1 415 555 0133", email: "priya.r@example.net" };
const jonas = { apptId: "OM-1005", firstName: "Jonas", lastName: "Weber", phone: "(415) 555-0144", email: "jonas.weber@example.com" };
const elena = { apptId: "OM-1006", firstName: "Elena", lastName: "Castillo", phone: "(415) 555-0155", email: "elena.castillo@example.com" };
const harriet = { apptId: "OM-1007", firstName: "Harriet", lastName: "Bloom", phone: "(415) 555-0166", email: "harriet.bloom@example.com", apptType: "Acupuncture Treatment" };
const owen = { apptId: "OM-1008", firstName: "Owen", lastName: "Mercer", phone: "(415) 555-0100", email: "owen.mercer@example.com" };
const kathryn = { apptId: "OM-1009", firstName: "Kathryn", lastName: "Moreau", phone: "(415) 555-0178", email: "k.moreau@example.org" };
const sam = {
  apptId: "OM-1010", firstName: "Sam", lastName: "Whitfield", phone: "(415) 555-0188", email: "sam.whitfield@example.com",
  notes: "Patient reports chronic migraines and anxiety. Prefers morning visits.",
  diagnosis: "G43.909 Migraine, unspecified",
  chiefComplaint: "Recurring headaches",
  insuranceMemberId: "XZT-0000-TEST",
  card: { number: "4111 1111 1111 1111", expiry: "12/29", cvv: "123", nameOnCard: "Sam Whitfield" },
};

export const SCENARIOS: Scenario[] = [
  {
    id: "organic-books", title: "Organic lead books", summary: "A website lead books a consult at Lakeside.",
    takeaway: "The existing opportunity moves to Consult Booked and the nurture texts stop.",
    focusContactIds: ["c_maya"], setup: [], fire: [payload(maya)],
  },
  {
    id: "paid-books", title: "Paid ad lead books", summary: "A Meta ad lead books at Northfield.",
    takeaway: "It stays in the paid pipeline, and the campaign and UTM details don't change.",
    focusContactIds: ["c_theo"], setup: [], fire: [payload(theo)],
  },
  {
    id: "duplicate-delivery", title: "Same webhook arrives twice", summary: "The EHR sends one booking two times.",
    takeaway: "The second delivery changes nothing. The ledger marks it as a duplicate.",
    focusContactIds: ["c_nadia"], setup: [], fire: [payload(nadia), payload(nadia)],
  },
  {
    id: "different-email", title: "New email, same phone", summary: "A lead books using a different email address.",
    takeaway: "The phone finds the right contact, so no duplicate appears and the stored email stays as it was.",
    focusContactIds: ["c_priya"], setup: [], fire: [payload(priya)],
  },
  {
    id: "reschedule", title: "Patient reschedules", summary: "A booked consult moves to a new time.",
    takeaway: "The consult time updates and the stage stays at Consult Booked.",
    focusContactIds: ["c_jonas"], setup: [payload(jonas)],
    fire: [payload({ ...jonas, apptStatus: "Rescheduled", apptDate: TIMES.moved, updatedAt: "2026-11-06T16:00:00.000Z" })],
  },
  {
    id: "cancellation", title: "Patient cancels", summary: "A booked consult is cancelled.",
    takeaway: "The opportunity moves to Consult Cancelled and a short re-book sequence starts.",
    focusContactIds: ["c_elena"], setup: [payload(elena)],
    fire: [payload({ ...elena, apptStatus: "Cancelled", updatedAt: "2026-11-06T16:00:00.000Z" })],
  },
  {
    id: "treatment-ignored", title: "Existing patient books a treatment", summary: "A current patient books a regular treatment.",
    takeaway: "HighLevel isn't contacted at all. The ledger records that it was ignored.",
    focusContactIds: ["c_harriet"], setup: [], fire: [payload(harriet)],
  },
  {
    id: "unknown-consult", title: "Unknown person books a consult", summary: "Someone not in HighLevel books directly.",
    takeaway: "A contact and an organic opportunity are created, with the source set to direct booking.",
    focusContactIds: [], setup: [], fire: [payload(owen)],
  },
  {
    id: "ambiguous", title: "Unclear match", summary: "A similar name and a phone one digit off an existing contact.",
    takeaway: "Nothing is merged or created. A person gets a flagged row to review.",
    focusContactIds: ["c_katherine"], setup: [], fire: [payload(kathryn)],
  },
  {
    id: "notes-and-card", title: "Notes and card data in the payload", summary: "The webhook includes clinical notes and card details.",
    takeaway: "Those fields are removed before anything is stored or sent. Only their names are logged.",
    focusContactIds: ["c_sam"], setup: [], fire: [payload(sam)],
  },
];
