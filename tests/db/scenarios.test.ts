// The ten simulator scenarios, run exactly as the page runs them.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { runScenario } from "@/lib/sim/run";
import { SCENARIOS } from "@/lib/sim/scenarios";
import { closePool } from "@/lib/sync/store";
import { databaseDump } from "../helpers";

const run = async (id: string) => (await runScenario(id, randomUUID()))!;
const writes = (r: Awaited<ReturnType<typeof run>>) => r.calls.filter((c) => c.method !== "GET" && c.path !== "/contacts/search");

afterAll(closePool);

describe("simulator scenarios", () => {
  it("has exactly the ten requested scenarios", () => expect(SCENARIOS).toHaveLength(10));
  it("returns null for an unknown scenario", async () => expect(await runScenario("nope", randomUUID())).toBeNull());

  it("organic lead books", async () => {
    const r = await run("organic-books");
    const [contact] = r.after.contacts;
    expect(r.before.contacts[0].opportunities[0].stage).toBe("New Lead");
    expect(contact.opportunities[0]).toMatchObject({ stage: "Consult Booked", pipelineKind: "organic", source: "Website contact form" });
    expect(contact.tags).toContain("consult-booked");
    expect(contact.workflows).toEqual([]);
    expect(r.deliveries[0].ledger).toMatchObject({ outcome: "applied", matchMethod: "phone", pipeline: "organic" });
  });

  it("paid lead stays in the paid pipeline with attribution intact", async () => {
    const r = await run("paid-books");
    const before = r.before.contacts[0].opportunities[0];
    const after = r.after.contacts[0].opportunities[0];
    expect(after).toMatchObject({ stage: "Consult Booked", pipeline: "Northfield Paid Ads", pipelineKind: "paid" });
    expect({ s: after.source, c: after.campaign, u: after.utm }).toEqual({ s: before.source, c: before.campaign, u: before.utm });
    expect(after.campaign).toBe("Spring back pain relief");
    expect(r.after.opportunityCount).toBe(r.before.opportunityCount);
  });

  it("same webhook delivered twice does nothing the second time", async () => {
    const r = await run("duplicate-delivery");
    expect(r.deliveries.map((d) => d.ledger!.outcome)).toEqual(["applied", "duplicate"]);
    expect(writes(r).filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(r.after.contacts[0].tags.filter((t) => t === "consult-booked")).toHaveLength(1);
  });

  it("different email, same phone: same contact, no duplicate, stored email kept", async () => {
    const r = await run("different-email");
    expect(r.deliveries[0].ledger).toMatchObject({ outcome: "applied", matchMethod: "phone", ghlContactId: "c_priya" });
    expect(r.after.contactCount).toBe(r.before.contactCount);
    expect(r.after.contacts[0].email).toBe("priya.raman@example.com");
  });

  it("reschedule updates the time and keeps the stage", async () => {
    const r = await run("reschedule");
    const before = r.before.contacts[0].opportunities[0];
    const after = r.after.contacts[0].opportunities[0];
    expect(before.stage).toBe("Consult Booked");
    expect(after.stage).toBe("Consult Booked");
    expect(after.consultTime).not.toBe(before.consultTime);
    expect(after.consultTime).toBe("2026-11-19T21:30:00.000Z");
    expect(r.deliveries[0].ledger).toMatchObject({ eventType: "rescheduled", matchMethod: "ledger" });
  });

  it("cancellation moves to Consult Cancelled and starts the re-book sequence", async () => {
    const r = await run("cancellation");
    const [contact] = r.after.contacts;
    expect(contact.opportunities[0].stage).toBe("Consult Cancelled");
    expect(contact.tags).not.toContain("consult-booked");
    expect(contact.workflows).toEqual(["Re-book sequence"]);
  });

  it("existing patient treatment is ignored without touching HighLevel", async () => {
    const r = await run("treatment-ignored");
    expect(r.deliveries[0].ledger).toMatchObject({ outcome: "ignored", appointmentCategory: "treatment" });
    expect(r.calls).toEqual([]);
    expect(r.after).toEqual(r.before);
  });

  it("unknown person gets a contact and an organic direct-booking opportunity", async () => {
    const r = await run("unknown-consult");
    expect(r.after.contactCount).toBe(r.before.contactCount + 1);
    expect(r.after.opportunityCount).toBe(r.before.opportunityCount + 1);
    expect(r.after.contacts[0]).toMatchObject({ name: "Owen Mercer", phone: "+14155550100" });
    expect(r.after.contacts[0].opportunities[0]).toMatchObject({ stage: "Consult Booked", pipelineKind: "organic", source: "direct booking" });
    expect(r.deliveries[0].ledger).toMatchObject({ outcome: "applied", matchMethod: "new_contact" });
  });

  it("ambiguous match is flagged, never merged", async () => {
    const r = await run("ambiguous");
    expect(r.deliveries[0].ledger).toMatchObject({ outcome: "needs_review", matchMethod: "fuzzy_flagged" });
    expect(r.deliveries[0].ledger!.reason).toContain("c_katherine");
    expect(writes(r)).toEqual([]);
    expect(r.after).toEqual(r.before);
  });

  it("notes and card data are stripped before storage and before HighLevel", async () => {
    const r = await run("notes-and-card");
    expect(r.deliveries[0].ledger!.droppedFields).toEqual(
      expect.arrayContaining(["notes", "diagnosis", "chiefComplaint", "insuranceMemberId", "card.number", "card.cvv", "card.expiry", "card.nameOnCard"]),
    );
    const sentToGhl = JSON.stringify(r.calls);
    const stored = await databaseDump();
    for (const secret of ["migraine", "G43", "Recurring headaches", "4111", "XZT-0000", "12/29"]) {
      expect(sentToGhl.toLowerCase()).not.toContain(secret.toLowerCase());
      expect(stored.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("the ledger holds no names, phones or emails from any scenario", async () => {
    for (const s of SCENARIOS) await run(s.id);
    const stored = await databaseDump();
    for (const pii of ["Lindqvist", "Okafor", "Mercer", "@example", "+1415", "555-01"]) expect(stored).not.toContain(pii);
  });
});
