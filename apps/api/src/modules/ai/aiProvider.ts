// Provider abstraction for AI reply generation, same principle as
// WhatsAppProvider: nothing outside this file and aiProviderFactory.ts
// should know or care which underlying model actually generates a reply.

export interface ConversationTurn {
  role: "customer" | "assistant";
  text: string;
}

export interface GenerateReplyInput {
  systemPrompt: string;
  conversationHistory: ConversationTurn[]; // oldest first
}

export interface GenerateReplyResult {
  // Raw text response from the model - NOT yet validated/parsed into the
  // structured {reply, confidence, escalate} shape. Parsing happens in
  // aiResponseParsing.ts, deliberately kept separate from the provider so
  // a malformed response from any provider is handled identically.
  rawResponseText: string;
  model: string;
}

export interface AiProvider {
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
