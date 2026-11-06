// HighLevel API v2 client. Endpoints, bodies and scopes follow
// https://marketplace.gohighlevel.com/docs/ (links per method are in the README).
import { GhlError, type ContactFilter, type CreateOpportunityInput, type GhlClient, type GhlContact, type GhlOpportunity, type UpdateOpportunityInput, type UpsertContactInput } from "./types";

const BASE_URL = "https://services.leadconnectorhq.com";

export type HttpGhlOptions = {
  /** Private Integration Token or OAuth access token for one sub-account. */
  token: string;
  version?: string;
  fetchImpl?: typeof fetch;
  /** Test hook, so 429 back-off does not slow the suite down. */
  sleep?: (ms: number) => Promise<void>;
};

export class HttpGhlClient implements GhlClient {
  private readonly version: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpGhlOptions) {
    this.version = options.version ?? "v3";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async request<T>(operation: string, method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          Version: this.version,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 2) {
        const seconds = Number(res.headers.get("retry-after"));
        await this.sleep(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000 * (attempt + 1));
        continue;
      }
      if (okStatuses.includes(res.status)) return undefined as T;
      if (!res.ok) throw new GhlError(operation, res.status);
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
  }

  // POST /contacts/search (contacts.readonly)
  async searchContacts(locationId: string, filters: ContactFilter[]) {
    const r = await this.request<{ contacts?: GhlContact[] }>("searchContacts", "POST", "/contacts/search", { locationId, pageLimit: 20, filters });
    return r.contacts ?? [];
  }

  // POST /contacts/upsert (contacts.write). `tags` is never sent: the docs say it overwrites all tags.
  async upsertContact(input: UpsertContactInput) {
    const r = await this.request<{ new: boolean; contact: GhlContact }>("upsertContact", "POST", "/contacts/upsert", input);
    return { contact: r.contact, isNew: r.new };
  }

  // GET /opportunities/search (opportunities.readonly)
  async searchOpportunities(q: { locationId: string; contactId: string; status: "open" }) {
    const params = new URLSearchParams({ locationId: q.locationId, contactId: q.contactId, status: q.status, limit: "100" });
    const r = await this.request<{ opportunities?: GhlOpportunity[] }>("searchOpportunities", "GET", `/opportunities/search?${params}`);
    return r.opportunities ?? [];
  }

  // POST /opportunities/ (opportunities.write)
  async createOpportunity(input: CreateOpportunityInput) {
    const r = await this.request<{ opportunity: GhlOpportunity }>("createOpportunity", "POST", "/opportunities/", input);
    return r.opportunity;
  }

  // PUT /opportunities/{id} (opportunities.write)
  async updateOpportunity(id: string, input: UpdateOpportunityInput) {
    const r = await this.request<{ opportunity: GhlOpportunity }>("updateOpportunity", "PUT", `/opportunities/${encodeURIComponent(id)}`, input);
    return r.opportunity;
  }

  // POST /contacts/{contactId}/tags (contacts.write)
  async addTags(contactId: string, tags: string[]) {
    await this.request("addTags", "POST", `/contacts/${encodeURIComponent(contactId)}/tags`, { tags });
  }

  // DELETE /contacts/{contactId}/tags (contacts.write)
  async removeTags(contactId: string, tags: string[]) {
    await this.request("removeTags", "DELETE", `/contacts/${encodeURIComponent(contactId)}/tags`, { tags });
  }

  // POST /contacts/{contactId}/workflow/{workflowId} (contacts.write)
  async addToWorkflow(contactId: string, workflowId: string) {
    await this.request("addToWorkflow", "POST", `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(workflowId)}`, {});
  }

  // DELETE /contacts/{contactId}/workflow/{workflowId} (contacts.write)
  // A 404 means the contact was not in that workflow, which is the state we want.
  async removeFromWorkflow(contactId: string, workflowId: string) {
    await this.request("removeFromWorkflow", "DELETE", `/contacts/${encodeURIComponent(contactId)}/workflow/${encodeURIComponent(workflowId)}`, {}, [404]);
  }
}
