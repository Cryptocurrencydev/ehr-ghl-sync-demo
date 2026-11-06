import { describe, expect, it } from "vitest";
import { minimise } from "@/lib/sync/minimise";
import { adaptOptiMantra } from "@/lib/sync/optimantra-adapter";
import { payload, TIMES } from "@/lib/sim/scenarios";

const base = { apptId: "A-1", firstName: "Maya", lastName: "Lindqvist", phone: "(415) 555-0111", email: "MAYA@Example.com" };

describe("minimise", () => {
  it("keeps only allowed fields and logs the rest by name", () => {
    const r = minimise({ phone: "1", notes: "secret", card: { number: "4111", cvv: "1" } }, ["phone"]);
    expect(r.kept).toEqual({ phone: "1" });
    expect(r.droppedFields).toEqual(["card.cvv", "card.number", "notes"]);
    expect(JSON.stringify(r.droppedFields)).not.toContain("secret");
  });

  it("drops a field nobody has listed, without knowing what it is", () => {
    expect(minimise({ brandNewEhrField: "x" }, []).droppedFields).toEqual(["brandNewEhrField"]);
  });

  it("logs an array field by its own name", () => {
    expect(minimise({ medications: ["a", "b"] }, []).droppedFields).toEqual(["medications"]);
  });

  it("cleans and caps hostile field names", () => {
    const raw = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`f${i}<script>${"x".repeat(100)}`, 1]));
    const { droppedFields } = minimise(raw, []);
    expect(droppedFields).toHaveLength(50);
    expect(droppedFields.every((n) => n.length <= 64 && !n.includes("<"))).toBe(true);
  });
});

describe("adaptOptiMantra", () => {
  it("maps the assumed payload to a clean event", () => {
    const r = adaptOptiMantra(payload(base));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event).toMatchObject({ appointmentId: "A-1", kind: "booked", phone: "+14155550111", email: "maya@example.com", startsAt: "2026-11-17T16:00:00.000Z" });
    expect(r.droppedFields).toEqual(["dateOfBirth", "providerName"]);
  });

  it("reads the long date format reported for apptDate, and ISO dates", () => {
    const iso = adaptOptiMantra(payload({ ...base, apptDate: "2026-11-17T16:00:00Z" }));
    const long = adaptOptiMantra(payload({ ...base, apptDate: TIMES.first }));
    expect(iso.ok && long.ok && iso.event.startsAt === long.event.startsAt).toBe(true);
  });

  it.each([["Booked", "booked"], ["SCHEDULED", "booked"], ["confirmed", "booked"], ["Rescheduled", "rescheduled"], ["Cancelled", "cancelled"], ["canceled", "cancelled"]])(
    "reads status %s as %s",
    (apptStatus, kind) => {
      const r = adaptOptiMantra(payload({ ...base, apptStatus }));
      expect(r.ok && r.event.kind).toBe(kind);
    },
  );

  it("keeps an event with no email", () => {
    const { email: _email, ...noEmail } = base;
    const r = adaptOptiMantra(payload(noEmail));
    expect(r.ok && r.event.email).toBeNull();
  });

  it("allows a cancellation with no date", () => {
    const r = adaptOptiMantra({ ...payload({ ...base, apptStatus: "Cancelled" }), apptDate: undefined });
    expect(r.ok).toBe(true);
  });

  it("refuses a booking with no readable date, naming fields only", () => {
    const r = adaptOptiMantra(payload({ ...base, apptDate: "sometime soon" }));
    expect(r).toMatchObject({ ok: false, reason: "Missing or unreadable fields: apptDate" });
  });

  it("refuses an unknown status and a missing id", () => {
    expect(adaptOptiMantra(payload({ ...base, apptStatus: "Arrived" }))).toMatchObject({ ok: false });
    expect(adaptOptiMantra(payload({ ...base, apptId: "" }))).toMatchObject({ ok: false });
  });

  it.each([[null], [[]], ["text"], [5]])("refuses a non-object body %s", (raw) => {
    expect(adaptOptiMantra(raw)).toMatchObject({ ok: false, reason: "Payload is not a JSON object" });
  });
});
