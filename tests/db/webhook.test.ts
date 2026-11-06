import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ipAllowed, receiveWebhook, secretMatches } from "@/lib/sync/webhook";
import { closePool, listLedger } from "@/lib/sync/store";
import { PUT, POST } from "@/app/api/webhooks/optimantra/[secret]/route";
import { book, harness, maya } from "../helpers";

const SECRET = "test-webhook-secret";
const call = (handler: typeof POST, secret: string, body: string, headers: Record<string, string> = {}) =>
  handler(new Request("http://test.local/api/webhooks/optimantra/x", { method: "POST", body, headers }), { params: Promise.resolve({ secret }) });

beforeAll(() => {
  process.env.WEBHOOK_SECRET = SECRET;
  process.env.GHL_MODE = "mock";
});
afterAll(closePool);

describe("authenticity", () => {
  it("compares secrets exactly", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abd", "abc")).toBe(false);
    expect(secretMatches("ab", "abc")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(secretMatches("", undefined)).toBe(false);
    expect(secretMatches("anything", "")).toBe(false);
  });

  it("applies an allowlist only when one is set", () => {
    expect(ipAllowed("1.2.3.4", undefined)).toBe(true);
    expect(ipAllowed("1.2.3.4", "1.2.3.4, 5.6.7.8")).toBe(true);
    expect(ipAllowed("9.9.9.9", "1.2.3.4")).toBe(false);
    expect(ipAllowed(null, "1.2.3.4")).toBe(false);
  });

  it("refuses a wrong secret with a 404, a clean body and no ledger row", async () => {
    const before = (await listLedger("webhook", 500)).length;
    const res = await call(POST, "wrong", JSON.stringify(book(maya)));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ outcome: "refused" });
    expect(await listLedger("webhook", 500)).toHaveLength(before);
  });

  it("refuses an IP outside the allowlist", async () => {
    const h = harness();
    const r = await receiveWebhook(h.deps, { secret: "s", ipAllowlist: "1.1.1.1" }, { pathSecret: "s", ip: "2.2.2.2", rawBody: "{}" });
    expect(r).toEqual({ httpStatus: 403, ledger: null });
  });
});

describe("the webhook route", () => {
  it("accepts PUT, OptiMantra's default method, and POST", async () => {
    const put = await call(PUT, SECRET, JSON.stringify(book({ ...maya, apptId: `R-${Date.now()}` })));
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ outcome: "applied" });
    const post = await call(POST, SECRET, JSON.stringify(book({ ...maya, apptId: `R2-${Date.now()}` })));
    expect(post.status).toBe(200);
  });

  it("replies without repeating patient data", async () => {
    const res = await call(POST, SECRET, JSON.stringify(book({ ...maya, apptId: `R3-${Date.now()}` })));
    expect(await res.text()).not.toContain("Lindqvist");
  });

  it("logs and refuses malformed JSON", async () => {
    const res = await call(POST, SECRET, "not json");
    expect(res.status).toBe(400);
    expect((await listLedger("webhook", 1))[0]).toMatchObject({ outcome: "rejected", reason: "Payload is not valid JSON" });
  });

  it("logs and refuses a payload missing required fields, without its values", async () => {
    const res = await call(POST, SECRET, JSON.stringify({ firstName: "Maya", notes: "private" }));
    expect(res.status).toBe(422);
    const [row] = await listLedger("webhook", 1);
    expect(row.outcome).toBe("rejected");
    expect(row.droppedFields).toEqual(["notes"]);
    expect(JSON.stringify(row)).not.toContain("private");
  });

  it("refuses an oversized body", async () => {
    const res = await call(POST, SECRET, JSON.stringify({ notes: "x".repeat(70_000) }));
    expect(res.status).toBe(413);
  });
});
