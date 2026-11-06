// In-memory stand-in for HighLevel with the same interface as HttpGhlClient.
// It records each call with the real method and path, and refuses request fields the
// published schemas don't list, so sync code that drifts from the docs fails here first.
import { GhlError, type ContactFilter, type CreateOpportunityInput, type GhlClient, type GhlContact, type GhlOpportunity, type UpdateOpportunityInput, type UpsertContactInput } from "./types";

export type MockContact = GhlContact & { activeWorkflows: string[] };
export type MockState = { contacts: MockContact[]; opportunities: GhlOpportunity[] };
export type GhlCall = { method: string; path: string; body?: unknown };

const CREATE_FIELDS = ["pipelineId", "locationId", "name", "pipelineStageId", "status", "contactId", "monetaryValue", "assignedTo", "customFields"];
const UPDATE_FIELDS = ["pipelineId", "name", "pipelineStageId", "status", "monetaryValue", "assignedTo", "customFields"];

function assertDocumented(operation: string, body: object, allowed: string[]) {
  if (Object.keys(body).some((k) => !allowed.includes(k))) throw new GhlError(operation, 422);
}

export class MockGhl implements GhlClient {
  readonly calls: GhlCall[] = [];
  private state: MockState;
  private nextId = 1;
  private failures = new Map<string, number>();

  /** `latencyMs` makes each call take real time, so concurrency tests can actually interleave. */
  constructor(seed: MockState = { contacts: [], opportunities: [] }, private readonly latencyMs = 0) {
    this.state = structuredClone(seed);
  }

  snapshot(): MockState {
    return structuredClone(this.state);
  }

  /** Makes the next call to `operation` fail with `status`. */
  failNext(operation: keyof GhlClient, status = 500) {
    this.failures.set(operation, status);
  }

  /** The written-call log, without reads. */
  get writes() {
    return this.calls.filter((c) => c.method !== "GET" && c.path !== "/contacts/search");
  }

  private async record(operation: string, call: GhlCall) {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const failure = this.failures.get(operation);
    if (failure) {
      this.failures.delete(operation);
      throw new GhlError(operation, failure);
    }
    this.calls.push(structuredClone(call));
  }

  private contact(id: string) {
    const c = this.state.contacts.find((x) => x.id === id);
    if (!c) throw new GhlError("contact", 404);
    return c;
  }

  async searchContacts(locationId: string, filters: ContactFilter[]) {
    await this.record("searchContacts", { method: "POST", path: "/contacts/search", body: { locationId, pageLimit: 20, filters } });
    const value = (c: MockContact, f: ContactFilter) => (f.field === "lastNameLowerCase" ? c.lastName?.toLowerCase() : c[f.field]);
    return structuredClone(this.state.contacts.filter((c) => c.locationId === locationId && filters.every((f) => value(c, f) === f.value)));
  }

  async upsertContact(input: UpsertContactInput) {
    await this.record("upsertContact", { method: "POST", path: "/contacts/upsert", body: input });
    const existing = this.state.contacts.find(
      (c) => c.locationId === input.locationId && ((input.phone && c.phone === input.phone) || (input.email && c.email === input.email)),
    );
    if (existing) return { contact: structuredClone(existing), isNew: false };
    const contact: MockContact = { id: `contact_new_${this.nextId++}`, tags: [], activeWorkflows: [], ...input };
    this.state.contacts.push(contact);
    return { contact: structuredClone(contact), isNew: true };
  }

  async searchOpportunities(q: { locationId: string; contactId: string; status: "open" }) {
    const params = new URLSearchParams({ locationId: q.locationId, contactId: q.contactId, status: q.status, limit: "100" });
    await this.record("searchOpportunities", { method: "GET", path: `/opportunities/search?${params}` });
    return structuredClone(this.state.opportunities.filter((o) => o.locationId === q.locationId && o.contactId === q.contactId && o.status === q.status));
  }

  async createOpportunity(input: CreateOpportunityInput) {
    assertDocumented("createOpportunity", input, CREATE_FIELDS);
    await this.record("createOpportunity", { method: "POST", path: "/opportunities/", body: input });
    const opportunity: GhlOpportunity = { id: `opp_new_${this.nextId++}`, ...input };
    this.state.opportunities.push(opportunity);
    return structuredClone(opportunity);
  }

  async updateOpportunity(id: string, input: UpdateOpportunityInput) {
    assertDocumented("updateOpportunity", input, UPDATE_FIELDS);
    await this.record("updateOpportunity", { method: "PUT", path: `/opportunities/${id}`, body: input });
    const o = this.state.opportunities.find((x) => x.id === id);
    if (!o) throw new GhlError("updateOpportunity", 404);
    if (input.pipelineStageId) o.pipelineStageId = input.pipelineStageId;
    for (const field of input.customFields ?? []) {
      o.customFields = [...(o.customFields ?? []).filter((f) => f.key !== field.key), field];
    }
    return structuredClone(o);
  }

  async addTags(contactId: string, tags: string[]) {
    await this.record("addTags", { method: "POST", path: `/contacts/${contactId}/tags`, body: { tags } });
    const c = this.contact(contactId);
    c.tags = [...new Set([...(c.tags ?? []), ...tags])];
  }

  async removeTags(contactId: string, tags: string[]) {
    await this.record("removeTags", { method: "DELETE", path: `/contacts/${contactId}/tags`, body: { tags } });
    const c = this.contact(contactId);
    c.tags = (c.tags ?? []).filter((t) => !tags.includes(t));
  }

  async addToWorkflow(contactId: string, workflowId: string) {
    await this.record("addToWorkflow", { method: "POST", path: `/contacts/${contactId}/workflow/${workflowId}`, body: {} });
    const c = this.contact(contactId);
    c.activeWorkflows = [...new Set([...c.activeWorkflows, workflowId])];
  }

  async removeFromWorkflow(contactId: string, workflowId: string) {
    await this.record("removeFromWorkflow", { method: "DELETE", path: `/contacts/${contactId}/workflow/${workflowId}`, body: {} });
    const c = this.contact(contactId);
    c.activeWorkflows = c.activeWorkflows.filter((w) => w !== workflowId);
  }
}
