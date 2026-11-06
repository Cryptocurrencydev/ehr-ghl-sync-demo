// Per-location routing and appointment-type rules. The IDs are fictional. During setup they
// are replaced with the clinic's real sub-account, pipeline, stage and workflow IDs.
import type { AppointmentCategory, PipelineKind } from "./types";

export type PipelineConfig = {
  id: string;
  name: string;
  stages: { consultBooked: string; consultCancelled: string };
};

export type LocationConfig = {
  key: string;
  displayName: string;
  /** How the EHR spells this location, lowercased. */
  ehrNames: string[];
  /** Each location is its own HighLevel sub-account. */
  ghlLocationId: string;
  tokenEnv: string;
  pipelines: Record<PipelineKind, PipelineConfig>;
  /** Removed on booking so nurture texts stop, in both organic and paid sequences. */
  followUpWorkflowIds: string[];
  rebook: { enabled: boolean; workflowId: string };
};

export type SyncConfig = {
  locations: LocationConfig[];
  /** Lowercased EHR appointment type to category. Anything unlisted goes to review. */
  appointmentTypes: Record<string, AppointmentCategory>;
  bookedTag: string;
  directBookingSource: string;
  customFields: { consultTime: string; bookingSource: string };
};

export const defaultConfig: SyncConfig = {
  locations: [
    {
      key: "lakeside",
      displayName: "Lakeside",
      ehrNames: ["lakeside", "lumen acupuncture - lakeside"],
      ghlLocationId: "loc_lakeside",
      tokenEnv: "GHL_TOKEN_LAKESIDE",
      pipelines: {
        organic: { id: "pipe_lk_organic", name: "Lakeside Organic", stages: { consultBooked: "stg_lk_org_booked", consultCancelled: "stg_lk_org_cancelled" } },
        paid: { id: "pipe_lk_paid", name: "Lakeside Paid Ads", stages: { consultBooked: "stg_lk_paid_booked", consultCancelled: "stg_lk_paid_cancelled" } },
      },
      followUpWorkflowIds: ["wf_lk_organic_nurture", "wf_lk_paid_nurture"],
      rebook: { enabled: true, workflowId: "wf_lk_rebook" },
    },
    {
      key: "northfield",
      displayName: "Northfield",
      ehrNames: ["northfield", "lumen acupuncture - northfield"],
      ghlLocationId: "loc_northfield",
      tokenEnv: "GHL_TOKEN_NORTHFIELD",
      pipelines: {
        organic: { id: "pipe_nf_organic", name: "Northfield Organic", stages: { consultBooked: "stg_nf_org_booked", consultCancelled: "stg_nf_org_cancelled" } },
        paid: { id: "pipe_nf_paid", name: "Northfield Paid Ads", stages: { consultBooked: "stg_nf_paid_booked", consultCancelled: "stg_nf_paid_cancelled" } },
      },
      followUpWorkflowIds: ["wf_nf_organic_nurture", "wf_nf_paid_nurture"],
      rebook: { enabled: true, workflowId: "wf_nf_rebook" },
    },
  ],
  appointmentTypes: {
    "new patient consultation": "consult",
    "new patient consult": "consult",
    "initial consultation": "consult",
    "acupuncture treatment": "treatment",
    "follow-up treatment": "treatment",
    "cupping session": "treatment",
  },
  bookedTag: "consult-booked",
  directBookingSource: "direct booking",
  customFields: { consultTime: "consult_time", bookingSource: "booking_source" },
};

export function findLocation(config: SyncConfig, ehrName: string) {
  const name = ehrName.trim().toLowerCase();
  return config.locations.find((l) => l.ehrNames.includes(name));
}

export function categorise(config: SyncConfig, appointmentType: string): AppointmentCategory | null {
  return config.appointmentTypes[appointmentType.trim().toLowerCase()] ?? null;
}
