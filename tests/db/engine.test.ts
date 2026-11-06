// Edge cases beyond the simulator's scenarios.
import { afterAll, describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/sync/config";
import { closePool, listLedger } from "@/lib/sync/store";
import { TIMES } from "@/lib/sim/scenarios";
import { seedState } from "@/lib/sim/seed";
import { book, cancelled, harness, maya, moved, owen } from "../helpers";

afterAll(closePool);

const t = (minutes: number) => new Date(Date.UTC(2026, 10, 6, 15, minutes)).toISOString();

describe("idempotency", () => {
  it("does nothing on a replay of the booking after a cancellation", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(cancelled(maya));
    const writes = h.mock.writes.length;
    const { row } = await h.send(book(maya));
    expect(row.outcome).toBe("duplicate");
    expect(h.mock.writes).toHaveLength(writes);
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_cancelled");
  });

  it("does nothing on a replayed cancellation", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(cancelled(maya));
    const writes = h.mock.writes.length;
    expect((await h.send(cancelled(maya))).row.outcome).toBe("duplicate");
    expect(h.mock.writes).toHaveLength(writes);
  });

  it("applies once when the same webhook lands at the same moment", async () => {
    const h = harness(seedState(), defaultConfig, 5);
    const rows = await Promise.all([1, 2, 3, 4, 5].map(() => h.send(book(owen))));
    expect(rows.map((r) => r.row.outcome).sort()).toEqual(["applied", "duplicate", "duplicate", "duplicate", "duplicate"]);
    const s = h.mock.snapshot();
    expect(s.contacts.filter((c) => c.lastName === "Mercer")).toHaveLength(1);
    expect(s.opportunities.filter((o) => o.name.includes("Mercer"))).toHaveLength(1);
  });

  it("creates one contact and opportunity when a new patient books twice at once", async () => {
    const h = harness(seedState(), defaultConfig, 5);
    await Promise.all([h.send(book(owen)), h.send(book({ ...owen, apptId: "A-9" }))]);
    const s = h.mock.snapshot();
    expect(s.contacts.filter((c) => c.lastName === "Mercer")).toHaveLength(1);
    expect(s.opportunities.filter((o) => o.name.includes("Mercer"))).toHaveLength(1);
  });

  it("frees the delivery for a retry when HighLevel fails, and finishes the job", async () => {
    const h = harness();
    h.mock.failNext("addTags", 503);
    const first = await h.send(book(maya));
    expect(first).toMatchObject({ httpStatus: 502, row: { outcome: "failed", reason: "HighLevel addTags failed with status 503" } });
    const retry = await h.send(book(maya));
    expect(retry).toMatchObject({ httpStatus: 200, row: { outcome: "applied" } });
    expect(h.contact("c_maya").tags).toContain("consult-booked");
    expect(h.mock.snapshot().opportunities.filter((o) => o.contactId === "c_maya")).toHaveLength(1);
  });

  it("doesn't create a second opportunity when a retry follows a failure after creating one", async () => {
    const h = harness();
    h.mock.failNext("addTags", 500);
    await h.send(book(owen));
    await h.send(book(owen));
    expect(h.mock.snapshot().opportunities.filter((o) => o.name.includes("Mercer"))).toHaveLength(1);
    expect(h.mock.snapshot().contacts.filter((c) => c.lastName === "Mercer")).toHaveLength(1);
  });
});

describe("out-of-order delivery", () => {
  it("holds a cancel that arrives before its booking, then refuses the late booking", async () => {
    const h = harness();
    const early = await h.send(cancelled(maya, t(30)));
    expect(early.row).toMatchObject({ outcome: "ignored" });
    expect(h.mock.calls).toEqual([]);

    const late = await h.send(book({ ...maya, updatedAt: t(10) }));
    expect(late.row.outcome).toBe("ignored");
    expect(h.mock.writes).toEqual([]);
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_new");
  });

  it("flags a late booking when there is no timestamp to order it by", async () => {
    const h = harness();
    await h.send(cancelled(maya));
    const { row } = await h.send(book({ ...maya, updatedAt: "" }));
    expect(row.outcome).toBe("needs_review");
    expect(h.mock.writes).toEqual([]);
  });

  it("accepts a booking that is really newer than the cancellation", async () => {
    const h = harness();
    await h.send(cancelled(maya, t(10)));
    const { row } = await h.send(book({ ...maya, updatedAt: t(30) }));
    expect(row.outcome).toBe("applied");
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_booked");
  });

  it("ignores a stale cancellation older than the booking", async () => {
    const h = harness();
    await h.send(book({ ...maya, updatedAt: t(30) }));
    const { row } = await h.send(cancelled(maya, t(10)));
    expect(row.outcome).toBe("ignored");
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_booked");
  });

  it("treats a reschedule for an unseen appointment as the booking", async () => {
    const h = harness();
    const { row } = await h.send(moved(maya, TIMES.moved));
    expect(row).toMatchObject({ outcome: "applied", eventType: "rescheduled" });
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_booked");
  });

  it("flags a reschedule after a cancellation and leaves HighLevel alone", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(cancelled(maya, t(60)));
    const writes = h.mock.writes.length;
    expect((await h.send(moved(maya, TIMES.moved, t(70)))).row.outcome).toBe("needs_review");
    expect(h.mock.writes).toHaveLength(writes);
  });
});

describe("reschedules", () => {
  const consultTime = (h: ReturnType<typeof harness>) => h.opp("o_maya").customFields?.find((f) => f.key === "consult_time")?.fieldValue;
  const C = "Mon Nov 23 2026 09:00:00 GMT-0600 (Central Standard Time)";

  it("applies a second real reschedule of the same appointment", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(moved(maya, TIMES.moved, t(61)));
    expect((await h.send(moved(maya, C, t(62)))).row.outcome).toBe("applied");
    expect(consultTime(h)).toBe("2026-11-23T15:00:00.000Z");
  });

  it("allows moving back to an earlier reschedule time", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(moved(maya, TIMES.moved, t(61)));
    await h.send(moved(maya, C, t(62)));
    expect((await h.send(moved(maya, TIMES.moved, t(63)))).row.outcome).toBe("applied");
    expect(consultTime(h)).toBe("2026-11-19T21:30:00.000Z");
  });

  it("treats a repeated reschedule delivery as a duplicate", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(moved(maya, TIMES.moved, t(61)));
    expect((await h.send(moved(maya, TIMES.moved, t(61)))).row.outcome).toBe("duplicate");
  });

  it("reads a time change on a booked status as a reschedule, since the real EHR may not send one", async () => {
    const h = harness();
    await h.send(book(maya));
    const { row } = await h.send(book({ ...maya, apptDate: TIMES.moved, updatedAt: t(61) }));
    expect(row).toMatchObject({ outcome: "applied", eventType: "rescheduled" });
    expect(consultTime(h)).toBe("2026-11-19T21:30:00.000Z");
  });

  it("ignores a replay of the original booking after a reschedule", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(moved(maya, TIMES.moved, "2026-11-06T16:00:00.000Z"));
    expect((await h.send(book(maya))).row.outcome).toBe("ignored");
    expect(consultTime(h)).toBe("2026-11-19T21:30:00.000Z");
  });

  it("still allows a real move back after that replay was ignored", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(moved(maya, TIMES.moved, "2026-11-06T16:00:00.000Z"));
    await h.send(book(maya));
    const { row } = await h.send(moved(maya, TIMES.first, "2026-11-06T17:00:00.000Z"));
    expect(row.outcome).toBe("applied");
    expect(consultTime(h)).toBe("2026-11-17T16:00:00.000Z");
  });

  it("never sends a stage or pipeline on a reschedule", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(moved(maya, TIMES.moved));
    const last = h.mock.calls.filter((c) => c.method === "PUT").at(-1)!;
    expect(Object.keys(last.body as object)).toEqual(["customFields"]);
  });

  it("leaves a closed opportunity alone", async () => {
    const h = harness();
    await h.send(book(maya));
    const seed = h.mock.snapshot();
    seed.opportunities.find((o) => o.id === "o_maya")!.status = "won";
    const h2 = harness(seed);
    // Same run state is needed, so point the second mock at the first run's ledger.
    const deps = { ...h.deps, ghlFor: () => h2.mock };
    const { receiveWebhook } = await import("@/lib/sync/webhook");
    const r = await receiveWebhook(deps, { secret: "s" }, { pathSecret: "s", ip: null, rawBody: JSON.stringify(moved(maya, TIMES.moved)) });
    expect(r.ledger!.outcome).toBe("ignored");
    expect(h2.mock.writes).toEqual([]);
  });
});

describe("opportunities and pipelines", () => {
  const theo = { apptId: "P-1", firstName: "Theo", lastName: "Okafor", phone: "415.555.0122", email: "theo.okafor@example.com", locationName: "Northfield" };

  it("uses the paid pipeline's own stage ids for a paid lead, booked and cancelled", async () => {
    const h = harness();
    const { row } = await h.send(book(theo));
    expect(row.pipeline).toBe("paid");
    expect(h.opp("o_theo")).toMatchObject({ pipelineId: "pipe_nf_paid", pipelineStageId: "stg_nf_paid_booked" });
    await h.send(cancelled(theo));
    expect(h.opp("o_theo")).toMatchObject({ pipelineId: "pipe_nf_paid", pipelineStageId: "stg_nf_paid_cancelled" });
  });

  it("removes a paid lead from the agency's nurture workflow too", async () => {
    const h = harness();
    await h.send(book(theo));
    expect(h.contact("c_theo").activeWorkflows).toEqual([]);
  });

  it("never sends source, utm, campaign or pipeline on any opportunity update", async () => {
    const h = harness();
    await h.send(book({ ...maya }));
    await h.send(moved(maya, TIMES.moved));
    await h.send(cancelled(maya, "2026-11-06T17:00:00.000Z"));
    for (const call of h.mock.calls.filter((c) => c.method === "PUT")) {
      const keys = Object.keys(call.body as object);
      expect(keys.every((k) => ["pipelineStageId", "customFields"].includes(k))).toBe(true);
    }
    expect(h.opp("o_maya")).toMatchObject({ source: "Website contact form", pipelineId: "pipe_lk_organic", attribution: { utmSource: "google" } });
  });

  it("makes no contact-field writes to a matched contact", async () => {
    const h = harness();
    await h.send(book({ ...maya, firstName: "MAYA", email: "other@example.org" }));
    expect(h.mock.calls.some((c) => c.path === "/contacts/upsert")).toBe(false);
    expect(h.contact("c_maya")).toMatchObject({ firstName: "Maya", email: "maya.lindqvist@example.com", source: "Website contact form" });
  });

  it("creates an opportunity for an existing contact with none open", async () => {
    const seed = seedState();
    seed.opportunities = seed.opportunities.filter((o) => o.contactId !== "c_maya");
    const h = harness(seed);
    const { row } = await h.send(book(maya));
    expect(row).toMatchObject({ outcome: "applied", matchMethod: "phone", pipeline: "organic" });
    expect(h.mock.calls.find((c) => c.path === "/opportunities/")?.body).toMatchObject({ pipelineId: "pipe_lk_organic", customFields: [{ key: "consult_time" }, { key: "booking_source", fieldValue: "direct booking" }] });
  });

  it("reuses the open opportunity when a patient cancels and books a new appointment", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(cancelled(maya));
    const { row } = await h.send(book({ ...maya, apptId: "A-5", updatedAt: "2026-11-06T18:00:00.000Z" }));
    expect(row).toMatchObject({ outcome: "applied", ghlOpportunityId: "o_maya" });
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_booked");
    expect(h.contact("c_maya").activeWorkflows).toEqual([]);
    expect(h.mock.snapshot().opportunities.filter((o) => o.contactId === "c_maya")).toHaveLength(1);
  });

  it("keeps Consult Booked when an old appointment is cancelled after a new one was made", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(book({ ...maya, apptId: "A-5" }));
    const { row } = await h.send(cancelled(maya));
    expect(row.outcome).toBe("ignored");
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_booked");
  });

  it("stops nurture but flags the opportunities when organic and paid are both open", async () => {
    const seed = seedState();
    seed.opportunities.push({ id: "o_maya_paid", name: "Maya", locationId: "loc_lakeside", contactId: "c_maya", pipelineId: "pipe_lk_paid", pipelineStageId: "x", status: "open", source: "Meta lead ad" });
    const h = harness(seed);
    const { row } = await h.send(book(maya));
    expect(row.outcome).toBe("needs_review");
    expect(h.contact("c_maya").activeWorkflows).toEqual([]);
    expect(h.mock.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("ignores an open opportunity in a pipeline outside the config", async () => {
    const seed = seedState();
    seed.opportunities = seed.opportunities.map((o) => (o.id === "o_maya" ? { ...o, pipelineId: "pipe_retail" } : o));
    const h = harness(seed);
    await h.send(book(maya));
    expect(h.opp("o_maya").pipelineId).toBe("pipe_retail");
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_new");
  });

  it("flags a cancellation on an opportunity staff already moved on", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.mock.updateOpportunity("o_maya", { pipelineStageId: "stg_lk_org_showed" });
    const { row } = await h.send(cancelled(maya));
    expect(row.outcome).toBe("needs_review");
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_showed");
  });

  it("uses the contact upsert finds when the search index lags", async () => {
    const h = harness();
    const original = h.mock.searchContacts.bind(h.mock);
    h.mock.searchContacts = async () => [];
    const { row } = await h.send(book(maya));
    h.mock.searchContacts = original;
    expect(row).toMatchObject({ outcome: "applied", matchMethod: "existing_by_upsert", ghlContactId: "c_maya" });
    expect(h.mock.snapshot().contacts.filter((c) => c.lastName === "Lindqvist")).toHaveLength(1);
  });
});

describe("routing and configuration", () => {
  it("routes each location to its own sub-account", async () => {
    const h = harness();
    await h.send(book({ ...owen, locationName: "Northfield" }));
    const created = h.mock.snapshot().contacts.find((c) => c.lastName === "Mercer")!;
    expect(created.locationId).toBe("loc_northfield");
    expect(h.mock.calls.find((c) => c.path === "/opportunities/")?.body).toMatchObject({ pipelineId: "pipe_nf_organic", locationId: "loc_northfield" });
  });

  it("doesn't match a contact from the other location", async () => {
    const h = harness();
    await h.send(book({ apptId: "X", firstName: "Maya", lastName: "Lindqvist", phone: "(415) 555-0111", email: "maya.lindqvist@example.com", locationName: "Northfield" }));
    expect(h.mock.snapshot().contacts.filter((c) => c.lastName === "Lindqvist").map((c) => c.locationId).sort()).toEqual(["loc_lakeside", "loc_northfield"]);
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_new");
  });

  it("flags an unknown location with no HighLevel calls", async () => {
    const h = harness();
    const { row } = await h.send(book({ ...maya, locationName: "Downtown" }));
    expect(row.outcome).toBe("needs_review");
    expect(h.mock.calls).toEqual([]);
  });

  it("flags an unmapped appointment type with no HighLevel calls", async () => {
    const h = harness();
    const { row } = await h.send(book({ ...maya, apptType: "Herbal Pickup" }));
    expect(row).toMatchObject({ outcome: "needs_review", appointmentCategory: "unmapped" });
    expect(h.mock.calls).toEqual([]);
  });

  it("lets the clinic reclassify an appointment type in config", async () => {
    const config = { ...defaultConfig, appointmentTypes: { ...defaultConfig.appointmentTypes, "herbal pickup": "consult" as const } };
    const h = harness(seedState(), config);
    expect((await h.send(book({ ...maya, apptType: "Herbal Pickup" }))).row.outcome).toBe("applied");
  });

  it("ignores cancellation of a treatment too", async () => {
    const h = harness();
    const { row } = await h.send(cancelled({ ...maya, apptType: "Acupuncture Treatment" }));
    expect(row.outcome).toBe("ignored");
    expect(h.mock.calls).toEqual([]);
  });

  it("skips the re-book sequence when it's switched off", async () => {
    const config = { ...defaultConfig, locations: defaultConfig.locations.map((l) => ({ ...l, rebook: { ...l.rebook, enabled: false } })) };
    const h = harness(seedState(), config);
    await h.send(book(maya));
    await h.send(cancelled(maya));
    expect(h.opp("o_maya").pipelineStageId).toBe("stg_lk_org_cancelled");
    expect(h.mock.calls.some((c) => c.method === "POST" && c.path.includes("/workflow/"))).toBe(false);
  });
});

describe("missing details", () => {
  it("books by phone with no email", async () => {
    const h = harness();
    const { email: _email, ...noEmail } = maya;
    expect((await h.send(book(noEmail))).row).toMatchObject({ outcome: "applied", matchMethod: "phone" });
  });

  it("creates a contact with no email field at all", async () => {
    const h = harness();
    const { email: _email, ...noEmail } = owen;
    await h.send(book(noEmail));
    expect(h.mock.calls.find((c) => c.path === "/contacts/upsert")?.body).not.toHaveProperty("email");
  });

  it("flags a booking with no phone or email, and a cancel on it", async () => {
    const h = harness();
    const { row } = await h.send(book({ apptId: "A-7", firstName: "No", lastName: "Contact", phone: "n/a" }));
    expect(row.outcome).toBe("needs_review");
    expect(h.mock.writes).toEqual([]);
    expect((await h.send(cancelled({ apptId: "A-7", firstName: "No", lastName: "Contact" }))).row.outcome).toBe("needs_review");
  });
});

describe("the ledger", () => {
  it("writes one row per delivery, in every outcome", async () => {
    const h = harness();
    await h.send(book(maya));
    await h.send(book(maya));
    await h.send(cancelled(maya));
    await h.send(book({ ...maya, apptId: "T", apptType: "Cupping Session" }));
    const rows = (await listLedger("test", 500)).filter((r) => r.appointmentId === "A-1" || r.appointmentId === "T").slice(0, 4);
    expect(rows.map((r) => r.outcome).sort()).toEqual(["applied", "applied", "duplicate", "ignored"]);
  });

  it("records what was dropped by field name only", async () => {
    const h = harness();
    const { row } = await h.send(book({ ...maya, notes: "private note" }));
    expect(row.droppedFields).toContain("notes");
    expect(JSON.stringify(row)).not.toContain("private note");
  });
});
