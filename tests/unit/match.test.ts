import { describe, expect, it } from "vitest";
import { MockGhl } from "@/lib/ghl/mock";
import { firstNamesDiffer, matchContact } from "@/lib/sync/match";
import type { CleanEvent } from "@/lib/sync/types";

const event = (over: Partial<CleanEvent>): CleanEvent => ({
  appointmentId: "A", kind: "booked", status: "booked", appointmentType: "x", location: "Lakeside", startsAt: null, occurredAt: null,
  firstName: "Ana", lastName: "Reyes", phone: "+14155550101", email: "ana@example.com", ...over,
});
const person = (id: string, firstName: string, lastName: string, phone: string | null, email: string | null) =>
  ({ id, locationId: "L", firstName, lastName, phone, email, tags: [], activeWorkflows: [] });
const ghl = (...contacts: ReturnType<typeof person>[]) => new MockGhl({ contacts, opportunities: [] });

describe("matchContact", () => {
  it("matches on phone first, even when the email differs", async () => {
    const r = await matchContact(ghl(person("a", "Ana", "Reyes", "+14155550101", "old@example.com")), "L", event({}));
    expect(r).toMatchObject({ kind: "matched", method: "phone" });
  });

  it("falls back to email when the phone is unknown", async () => {
    const r = await matchContact(ghl(person("a", "Ana", "Reyes", "+14155550109", "ana@example.com")), "L", event({}));
    expect(r).toMatchObject({ kind: "matched", method: "email" });
  });

  it("matches by phone with no email on the booking", async () => {
    const r = await matchContact(ghl(person("a", "Ana", "Reyes", "+14155550101", null)), "L", event({ email: null }));
    expect(r).toMatchObject({ kind: "matched", method: "phone" });
  });

  it("matches by email with no phone on the booking", async () => {
    const r = await matchContact(ghl(person("a", "Ana", "Reyes", null, "ana@example.com")), "L", event({ phone: null }));
    expect(r).toMatchObject({ kind: "matched", method: "email" });
  });

  it("flags a booking with neither phone nor email", async () => {
    expect(await matchContact(ghl(), "L", event({ phone: null, email: null }))).toMatchObject({ kind: "review" });
  });

  it("flags two contacts sharing a phone", async () => {
    const r = await matchContact(ghl(person("a", "Ana", "Reyes", "+14155550101", null), person("b", "Ana", "Reyes", "+14155550101", null)), "L", event({}));
    expect(r).toMatchObject({ kind: "review", candidateIds: ["a", "b"] });
  });

  it("flags phone and email pointing at different contacts", async () => {
    const r = await matchContact(ghl(person("a", "Ana", "Reyes", "+14155550101", null), person("b", "Ana", "Reyes", null, "ana@example.com")), "L", event({}));
    expect(r).toMatchObject({ kind: "review", reason: "Phone and email point to different contacts" });
  });

  it("flags a relative sharing a phone instead of booking them onto the wrong person", async () => {
    const r = await matchContact(ghl(person("a", "Robert", "Reyes", "+14155550101", "rob@example.com")), "L", event({}));
    expect(r).toMatchObject({ kind: "review" });
  });

  it("flags a near-miss name and phone as fuzzy, and never as a match", async () => {
    const r = await matchContact(ghl(person("a", "Anna", "Reyes", "+14155550102", "other@example.com")), "L", event({}));
    expect(r).toMatchObject({ kind: "review", fuzzy: true });
  });

  it("treats the same surname with an unrelated phone as a new person", async () => {
    const r = await matchContact(ghl(person("a", "Anna", "Reyes", "+13125550188", "other@example.com")), "L", event({}));
    expect(r).toEqual({ kind: "none" });
  });

  it("only searches the sub-account it is given", async () => {
    const r = await matchContact(ghl({ ...person("a", "Ana", "Reyes", "+14155550101", null), locationId: "OTHER" }), "L", event({}));
    expect(r).toEqual({ kind: "none" });
  });
});

describe("firstNamesDiffer", () => {
  it.each([["Kate", "Katherine"], ["Jon", "John"], ["ANA", "ana"], ["", "Ana"]])("treats %s and %s as compatible", (a, b) => {
    expect(firstNamesDiffer(a, b)).toBe(false);
  });
  it("spots different people", () => expect(firstNamesDiffer("Maria", "Robert")).toBe(true));
});
