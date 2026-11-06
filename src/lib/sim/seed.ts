// The fictional HighLevel sub-accounts the simulator starts from. All people are invented
// and all numbers are in the 555-01XX range reserved for fiction.
import type { MockContact, MockState } from "../ghl/mock";
import type { GhlOpportunity } from "../ghl/types";

const LK = "loc_lakeside";
const NF = "loc_northfield";

const contact = (id: string, locationId: string, firstName: string, lastName: string, phone: string, email: string, source: string, activeWorkflows: string[], tags: string[] = []): MockContact => ({
  id, locationId, firstName, lastName, phone, email, source, activeWorkflows, tags,
});

const organicOpp = (id: string, contactId: string, name: string, stage = "stg_lk_org_new"): GhlOpportunity => ({
  id, name, locationId: LK, contactId, pipelineId: "pipe_lk_organic", pipelineStageId: stage, status: "open", source: "Website contact form",
  attribution: { utmSource: "google", utmMedium: "organic" },
});

export function seedState(): MockState {
  return {
    contacts: [
      contact("c_maya", LK, "Maya", "Lindqvist", "+14155550111", "maya.lindqvist@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
      contact("c_theo", NF, "Theo", "Okafor", "+14155550122", "theo.okafor@example.com", "Meta lead ad", ["wf_nf_paid_nurture"]),
      contact("c_priya", LK, "Priya", "Raman", "+14155550133", "priya.raman@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
      contact("c_jonas", LK, "Jonas", "Weber", "+14155550144", "jonas.weber@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
      contact("c_elena", LK, "Elena", "Castillo", "+14155550155", "elena.castillo@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
      contact("c_harriet", LK, "Harriet", "Bloom", "+14155550166", "harriet.bloom@example.com", "Referral", [], ["patient"]),
      contact("c_katherine", LK, "Katherine", "Moreau", "+14155550177", "katherine.moreau@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
      contact("c_sam", LK, "Sam", "Whitfield", "+14155550188", "sam.whitfield@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
      contact("c_nadia", LK, "Nadia", "Haddad", "+14155550199", "nadia.haddad@example.com", "Website contact form", ["wf_lk_organic_nurture"]),
    ],
    opportunities: [
      organicOpp("o_maya", "c_maya", "Maya Lindqvist"),
      {
        id: "o_theo", name: "Theo Okafor", locationId: NF, contactId: "c_theo", pipelineId: "pipe_nf_paid", pipelineStageId: "stg_nf_paid_contacted", status: "open",
        source: "Meta lead ad", attribution: { campaign: "Spring back pain relief", utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "spring_back_pain" },
      },
      organicOpp("o_priya", "c_priya", "Priya Raman"),
      organicOpp("o_jonas", "c_jonas", "Jonas Weber"),
      organicOpp("o_elena", "c_elena", "Elena Castillo"),
      organicOpp("o_katherine", "c_katherine", "Katherine Moreau"),
      organicOpp("o_sam", "c_sam", "Sam Whitfield"),
      organicOpp("o_nadia", "c_nadia", "Nadia Haddad"),
    ],
  };
}

export const STAGE_LABELS: Record<string, string> = {
  stg_lk_org_new: "New Lead",
  stg_lk_org_booked: "Consult Booked",
  stg_lk_org_cancelled: "Consult Cancelled",
  stg_lk_paid_booked: "Consult Booked",
  stg_lk_paid_cancelled: "Consult Cancelled",
  stg_nf_org_booked: "Consult Booked",
  stg_nf_org_cancelled: "Consult Cancelled",
  stg_nf_paid_contacted: "Contacted",
  stg_nf_paid_booked: "Consult Booked",
  stg_nf_paid_cancelled: "Consult Cancelled",
};

export const WORKFLOW_LABELS: Record<string, string> = {
  wf_lk_organic_nurture: "Organic nurture texts",
  wf_lk_paid_nurture: "Paid nurture texts",
  wf_lk_rebook: "Re-book sequence",
  wf_nf_organic_nurture: "Organic nurture texts",
  wf_nf_paid_nurture: "Paid nurture texts",
  wf_nf_rebook: "Re-book sequence",
};
