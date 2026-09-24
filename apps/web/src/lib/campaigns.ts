import { api } from "./api";
import type {
  AudienceFilter,
  AudiencePreview,
  Campaign,
  CampaignRecipient,
  CampaignTemplateType,
  LaunchResult,
  MessageTemplate,
} from "@/types/campaign";

export async function fetchCampaignTemplateTypes(): Promise<CampaignTemplateType[]> {
  return (await api.get<CampaignTemplateType[]>("/campaigns/template-types")).data;
}

export async function fetchMessageTemplates(): Promise<MessageTemplate[]> {
  return (await api.get<MessageTemplate[]>("/message-templates")).data;
}

export interface CreateMessageTemplateInput {
  name: string;
  channel: "whatsapp";
  providerTemplateName: string;
  bodyPreview: string;
}

export async function createMessageTemplate(input: CreateMessageTemplateInput): Promise<MessageTemplate> {
  return (await api.post<MessageTemplate>("/message-templates", input)).data;
}

export async function previewAudience(filter: AudienceFilter): Promise<AudiencePreview> {
  return (await api.post<AudiencePreview>("/campaigns/audience-preview", filter)).data;
}

export interface CreateCampaignInput {
  name: string;
  templateTypeKey: string;
  messageTemplateId: string;
  audienceFilter: AudienceFilter;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  return (await api.post<Campaign>("/campaigns", input)).data;
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  return (await api.get<Campaign[]>("/campaigns")).data;
}

export async function fetchCampaign(id: string): Promise<Campaign> {
  return (await api.get<Campaign>(`/campaigns/${id}`)).data;
}

export async function fetchCampaignRecipients(id: string): Promise<CampaignRecipient[]> {
  return (await api.get<CampaignRecipient[]>(`/campaigns/${id}/recipients`)).data;
}

export async function launchCampaign(id: string): Promise<LaunchResult> {
  return (await api.post<LaunchResult>(`/campaigns/${id}/launch`)).data;
}

export async function pauseCampaign(id: string): Promise<Campaign> {
  return (await api.post<Campaign>(`/campaigns/${id}/pause`)).data;
}

export async function resumeCampaign(id: string): Promise<Campaign> {
  return (await api.post<Campaign>(`/campaigns/${id}/resume`)).data;
}

export async function stopCampaign(id: string): Promise<Campaign> {
  return (await api.post<Campaign>(`/campaigns/${id}/stop`)).data;
}
