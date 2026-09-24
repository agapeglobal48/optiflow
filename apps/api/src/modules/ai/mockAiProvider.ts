import { AiProvider, GenerateReplyInput, GenerateReplyResult } from "./aiProvider";

// Deterministic, keyword-based "AI" for local development - no API key,
// no cost, no network call. Good enough to exercise the full pipeline
// (guardrails, confidence threshold, kill switch, traceability) without
// needing a real model. Real intelligence comes from AnthropicProvider.
export class MockAiProvider implements AiProvider {
  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const lastCustomerMessage =
      [...input.conversationHistory].reverse().find((t) => t.role === "customer")?.text ?? "";

    const lower = lastCustomerMessage.toLowerCase();

    let response: object;
    if (lower.includes("book") || lower.includes("yes")) {
      response = {
        escalate: false,
        reply: "Great! I'll get that booked in for you - someone from the team will confirm your slot shortly.",
        confidence: 0.92,
      };
    } else {
      response = {
        escalate: false,
        reply: "Thanks for your message! Let me know if you'd like to book your eye test.",
        confidence: 0.55,
      };
    }

    return {
      rawResponseText: JSON.stringify(response),
      model: "mock-ai-v1",
    };
  }
}
