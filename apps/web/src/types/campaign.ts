// Mirrors apps/api Campaign/MessageTemplate/CampaignRecipient models and
// the campaigns + message-templates route responses.

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "STOPPED";

export interface CampaignTemplateType {
  id: string;
  key: string;
  label: string;
  description: string | null;
}

export interface MessageTemplate {
  id: string;
  practiceId: string;
  name: string;
  channel: string;
  providerTemplateName: string;
  bodyPreview: string;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AudienceFilter {
  branchId?: string;
  recallDueBefore?: string;
  recallDueAfter?: string;
  appointmentType?: string;
}

export interface AudiencePreview {
  count: number;
  sample: {
    id: string;
    firstName: string;
    lastName: string | null;
    mobile: string | null;
    email: string | null;
    recallDueDate: string | null;
  }[];
}

export interface Campaign {
  id: string;
  practiceId: string;
  name: string;
  status: CampaignStatus;
  audienceFilter: AudienceFilter;
  templateType: CampaignTemplateType;
  messageTemplate: { name: string; channel: string };
  scheduledAt: string | null;
  launchedAt: string | null;
  completedAt: string | null;
  estimatedAudienceSize: number | null;
  suppressedCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipient {
  id: string;
  campaignId: string;
  customerId: string | null;
  snapshotName: string;
  snapshotChannel: string;
  snapshotContact: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  repliedAt: string | null;
  bookedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface LaunchResult {
  campaignId: string;
  queuedCount: number;
  suppressedCount: number;
  totalAudience: number;
}
