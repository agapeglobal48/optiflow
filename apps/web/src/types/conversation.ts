// Mirrors apps/api Conversation/Message models and the conversations route
// responses (apps/api/src/modules/conversations/*).

export type ConversationStatus =
  | "AI_HANDLING"
  | "WAITING_ON_CUSTOMER"
  | "HUMAN_QUEUE"
  | "HUMAN_HANDLING"
  | "BOOKED"
  | "CLOSED";

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageSender = "CUSTOMER" | "AI" | "STAFF" | "SYSTEM";

export interface ConversationCustomerSummary {
  firstName: string;
  lastName: string | null;
  mobile: string | null;
}

export interface ConversationListItem {
  id: string;
  practiceId: string;
  customerId: string;
  customer: ConversationCustomerSummary;
  status: ConversationStatus;
  aiAutoSendPaused: boolean;
  assignedAgentId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  campaignRecipientId: string | null;
  direction: MessageDirection;
  sender: MessageSender;
  channel: string;
  body: string;
  providerMessageId: string | null;
  status: string | null;
  errorDetail: string | null;
  aiModel: string | null;
  aiPromptVersion: string | null;
  aiConfidence: string | null;
  isInternalNote: boolean;
  createdAt: string;
}

export interface ConversationDetail extends ConversationListItem {
  customer: ConversationCustomerSummary & { email: string | null };
  messages: Message[];
}
