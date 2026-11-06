import { describe, expect, it } from "vitest";
import { HttpGhlClient } from "@/lib/ghl/http";
import { MockGhl } from "@/lib/ghl/mock";
import { GhlError, type GhlClient } from "@/lib/ghl/types";

type Sent = { url: string; method: string; headers: Record<string, string>; body: unknown };

function client(responses: Response[] = []) {
  const sent: Sent[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, method: init.method!, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(init.body as string) : undefined });
    return responses.shift() ?? new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { sent, ghl: new HttpGhlClient({ token: "pit-test", fetchImpl, sleep: async () => {} }) };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const BASE = "https://services.leadconnectorhq.com";

describe("HttpGhlClient follows the published API", () => {
  it("sends the bearer token and Version header", async () => {
    const { ghl, sent } = client();
    await ghl.addTags("c1", ["x"]);
    expect(sent[0].headers).toMatchObject({ Authorization: "Bearer pit-test", Version: "v3" });
  });

  it("lets the API version be pinned", async () => {
    const sent: RequestInit[] = [];
    const fetchImpl = (async (_: string, init: RequestInit) => (sent.push(init), new Response("{}"))) as typeof fetch;
    await new HttpGhlClient({ token: "t", version: "2021-07-28", fetchImpl }).addTags("c", ["x"]);
    expect(sent[0].headers).toMatchObject({ Version: "2021-07-28" });
  });

  it("POST /contacts/search with filters and pageLimit", async () => {
    const { ghl, sent } = client([json({ contacts: [{ id: "c1" }], total: 1 })]);
    const r = await ghl.searchContacts("L", [{ field: "phone", operator: "eq", value: "+14155550111" }]);
    expect(r).toEqual([{ id: "c1" }]);
    expect(sent[0]).toMatchObject({ url: `${BASE}/contacts/search`, method: "POST", body: { locationId: "L", pageLimit: 20, filters: [{ field: "phone", operator: "eq", value: "+14155550111" }] } });
  });

  it("POST /contacts/upsert, never sending tags because they would overwrite", async () => {
    const { ghl, sent } = client([json({ new: true, contact: { id: "c1" }, traceId: "t" })]);
    const r = await ghl.upsertContact({ locationId: "L", firstName: "A", lastName: "B", source: "direct booking" });
    expect(r).toEqual({ contact: { id: "c1" }, isNew: true });
    expect(sent[0].url).toBe(`${BASE}/contacts/upsert`);
    expect(sent[0].body).not.toHaveProperty("tags");
  });

  it("GET /opportunities/search with camelCase query parameters", async () => {
    const { ghl, sent } = client([json({ opportunities: [{ id: "o1" }], meta: {} })]);
    await ghl.searchOpportunities({ locationId: "L", contactId: "c1", status: "open" });
    const url = new URL(sent[0].url);
    expect(url.pathname).toBe("/opportunities/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ locationId: "L", contactId: "c1", status: "open", limit: "100" });
  });

  it("POST /opportunities/ and PUT /opportunities/{id}", async () => {
    const { ghl, sent } = client([json({ opportunity: { id: "o1" } }), json({ opportunity: { id: "o1" } })]);
    await ghl.createOpportunity({ locationId: "L", pipelineId: "p", pipelineStageId: "s", contactId: "c", name: "n", status: "open" });
    await ghl.updateOpportunity("o1", { pipelineStageId: "s2" });
    expect([sent[0].method, sent[0].url]).toEqual(["POST", `${BASE}/opportunities/`]);
    expect([sent[1].method, sent[1].url, sent[1].body]).toEqual(["PUT", `${BASE}/opportunities/o1`, { pipelineStageId: "s2" }]);
  });

  it("tag and workflow endpoints", async () => {
    const { ghl, sent } = client();
    await ghl.addTags("c", ["t"]);
    await ghl.removeTags("c", ["t"]);
    await ghl.addToWorkflow("c", "w");
    await ghl.removeFromWorkflow("c", "w");
    expect(sent.map((s) => `${s.method} ${s.url.replace(BASE, "")}`)).toEqual([
      "POST /contacts/c/tags", "DELETE /contacts/c/tags", "POST /contacts/c/workflow/w", "DELETE /contacts/c/workflow/w",
    ]);
  });

  it("treats removal from a workflow the contact isn't in as done", async () => {
    const { ghl } = client([new Response("{}", { status: 404 })]);
    await expect(ghl.removeFromWorkflow("c", "w")).resolves.toBeUndefined();
  });

  it("backs off on 429 and retries", async () => {
    const { ghl, sent } = client([new Response("", { status: 429, headers: { "retry-after": "1" } }), new Response("{}")]);
    await ghl.addTags("c", ["t"]);
    expect(sent).toHaveLength(2);
  });

  it("gives up after repeated 429s", async () => {
    const { ghl } = client([429, 429, 429].map((status) => new Response("", { status })));
    await expect(ghl.addTags("c", ["t"])).rejects.toBeInstanceOf(GhlError);
  });

  it("keeps response bodies out of errors, because they can echo contact details", async () => {
    const { ghl } = client([json({ message: "maya@example.com is invalid" }, 422)]);
    const error = await ghl.addTags("c", ["t"]).catch((e: Error) => e);
    expect((error as Error).message).toBe("HighLevel addTags failed with status 422");
  });
});

describe("MockGhl", () => {
  it("has every method of the real client", () => {
    const methods = Object.getOwnPropertyNames(HttpGhlClient.prototype).filter((m) => m !== "constructor" && m !== "request") as (keyof GhlClient)[];
    expect(methods).toHaveLength(9);
    for (const m of methods) expect(typeof new MockGhl()[m]).toBe("function");
  });

  it("refuses fields the published schemas don't list, such as source", async () => {
    const mock = new MockGhl();
    await expect(mock.updateOpportunity("o", { source: "x" } as never)).rejects.toMatchObject({ status: 422 });
    await expect(mock.createOpportunity({ source: "x" } as never)).rejects.toMatchObject({ status: 422 });
  });
});
