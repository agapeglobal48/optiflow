import { api } from "./api";
import type { KnowledgeEntry } from "@/types/settings";

export async function fetchKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  return (await api.get<KnowledgeEntry[]>("/knowledge-base")).data;
}

export interface KnowledgeEntryInput {
  topic: string;
  question?: string;
  answer: string;
}

export async function createKnowledgeEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry> {
  return (await api.post<KnowledgeEntry>("/knowledge-base", input)).data;
}

export async function updateKnowledgeEntry(id: string, input: Partial<KnowledgeEntryInput>): Promise<KnowledgeEntry> {
  return (await api.patch<KnowledgeEntry>(`/knowledge-base/${id}`, input)).data;
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  await api.delete(`/knowledge-base/${id}`);
}
