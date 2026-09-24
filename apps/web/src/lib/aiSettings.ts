import { api } from "./api";
import type { AiSettings } from "@/types/aiSettings";

export async function fetchAiSettings(): Promise<AiSettings> {
  return (await api.get<AiSettings>("/ai-settings")).data;
}

export interface UpdateAiSettingsInput {
  confidenceThreshold?: number;
  blocklistTerms?: string[];
  promptVersion?: string;
}

export async function updateAiSettings(input: UpdateAiSettingsInput): Promise<AiSettings> {
  return (await api.patch<AiSettings>("/ai-settings", input)).data;
}

export async function setAiKillSwitch(enabled: boolean): Promise<AiSettings> {
  return (await api.post<AiSettings>("/ai-settings/kill-switch", { enabled })).data;
}
