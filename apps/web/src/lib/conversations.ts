import { api } from "./api";
import type { ConversationDetail, ConversationListItem, ConversationStatus, Message } from "@/types/conversation";

export async function fetchConversations(status?: ConversationStatus): Promise<ConversationListItem[]> {
  return (await api.get<ConversationListItem[]>("/conversations", { params: status ? { status } : {} })).data;
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
  return (await api.get<ConversationDetail>(`/conversations/${id}`)).data;
}

export async function takeOverConversation(id: string): Promise<ConversationListItem> {
  return (await api.post<ConversationListItem>(`/conversations/${id}/take-over`)).data;
}

export async function releaseToAi(id: string): Promise<ConversationListItem> {
  return (await api.post<ConversationListItem>(`/conversations/${id}/release-to-ai`)).data;
}

export async function pauseAiForConversation(id: string): Promise<ConversationListItem> {
  return (await api.post<ConversationListItem>(`/conversations/${id}/ai-pause`)).data;
}

export async function resumeAiForConversation(id: string): Promise<ConversationListItem> {
  return (await api.post<ConversationListItem>(`/conversations/${id}/ai-resume`)).data;
}

export async function closeConversation(id: string): Promise<ConversationListItem> {
  return (await api.post<ConversationListItem>(`/conversations/${id}/close`)).data;
}

export interface SendMessageInput {
  body: string;
  isInternalNote?: boolean;
}

export async function sendMessage(id: string, input: SendMessageInput): Promise<Message> {
  return (await api.post<Message>(`/conversations/${id}/messages`, input)).data;
}
