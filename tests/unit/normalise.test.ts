import { describe, expect, it } from "vitest";
import { normaliseEmail, normalisePhone } from "@/lib/sync/normalise";

describe("normalisePhone", () => {
  it.each([
    ["(415) 555-0111"], ["415-555-0111"], ["415.555.0111"], ["415 555 0111"], ["4155550111"],
    ["14155550111"], ["1-415-555-0111"], ["+1 (415) 555-0111"], ["+14155550111"], ["  415-555-0111  "],
    ["415-555-0111 x12"], ["415-555-0111 ext. 12"],
  ])("reads %s as the same E.164 number", (raw) => {
    expect(normalisePhone(raw)).toBe("+14155550111");
  });

  it("accepts a number value", () => expect(normalisePhone(4155550111)).toBe("+14155550111"));
  it("keeps a foreign number's country code", () => expect(normalisePhone("+44 20 7946 0958")).toBe("+442079460958"));
  it.each([[""], ["n/a"], ["555-0111"], ["123"], [null], [undefined], [{}]])("rejects %s", (raw) => {
    expect(normalisePhone(raw)).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("lowercases and trims", () => expect(normaliseEmail("  Maya.L@Example.COM ")).toBe("maya.l@example.com"));
  it.each([[""], ["not-an-email"], ["a@b"], [null], [7]])("rejects %s", (raw) => expect(normaliseEmail(raw)).toBeNull());
});
