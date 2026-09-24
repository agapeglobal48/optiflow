// Mirrors apps/api AiSettings model (apps/api/src/modules/ai/aiSettingsService.ts).

export interface AiSettings {
  id: string;
  practiceId: string;
  autoSendEnabled: boolean;
  confidenceThreshold: string; // Decimal, serialized as a string
  blocklistTerms: string[];
  promptVersion: string;
  updatedAt: string;
}
