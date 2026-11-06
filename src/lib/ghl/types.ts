// The slice of the HighLevel API v2 (LeadConnector) this service uses.
// HttpGhlClient calls the real endpoints; MockGhl implements the same interface in memory.

export type GhlContact = {
  id: string;
  locationId: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  source?: string | null;
};

export type GhlCustomField = { key: string; fieldValue: string };

export type GhlOpportunity = {
  id: string;
  name: string;
  locationId: string;
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  status: "open" | "won" | "lost" | "abandoned";
  source?: string | null;
  customFields?: GhlCustomField[];
  /** Read-only marketing attribution, as set by the ad agency's forms. */
  attribution?: { campaign?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string };
};

/** Filter items from POST /contacts/search. */
export type ContactFilter = { field: "phone" | "email" | "lastNameLowerCase"; operator: "eq"; value: string };

export type UpsertContactInput = {
  locationId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  source: string;
};

/** Matches the documented create body. It has no `source` field. */
export type CreateOpportunityInput = {
  locationId: string;
  pipelineId: string;
  pipelineStageId: string;
  contactId: string;
  name: string;
  status: "open";
  customFields?: GhlCustomField[];
};

/**
 * What this service may change on an opportunity. Deliberately excludes pipelineId,
 * so a paid lead cannot be moved to another pipeline, and has no attribution fields.
 */
export type UpdateOpportunityInput = {
  pipelineStageId?: string;
  customFields?: GhlCustomField[];
};

export interface GhlClient {
  searchContacts(locationId: string, filters: ContactFilter[]): Promise<GhlContact[]>;
  upsertContact(input: UpsertContactInput): Promise<{ contact: GhlContact; isNew: boolean }>;
  searchOpportunities(q: { locationId: string; contactId: string; status: "open" }): Promise<GhlOpportunity[]>;
  createOpportunity(input: CreateOpportunityInput): Promise<GhlOpportunity>;
  updateOpportunity(id: string, input: UpdateOpportunityInput): Promise<GhlOpportunity>;
  addTags(contactId: string, tags: string[]): Promise<void>;
  removeTags(contactId: string, tags: string[]): Promise<void>;
  addToWorkflow(contactId: string, workflowId: string): Promise<void>;
  removeFromWorkflow(contactId: string, workflowId: string): Promise<void>;
}

export class GhlError extends Error {
  constructor(
    public readonly operation: string,
    public readonly status: number,
  ) {
    // Status and operation only: response bodies can echo contact details.
    super(`HighLevel ${operation} failed with status ${status}`);
  }
}
