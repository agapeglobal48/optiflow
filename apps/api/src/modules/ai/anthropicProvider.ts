import { AiProvider, GenerateReplyInput, GenerateReplyResult } from "./aiProvider";

interface AnthropicConfig {
  apiKey: string;
  model: string;
}

// Calls Anthropic's Messages API directly via fetch (no SDK dependency,
// consistent with how the WhatsApp providers call their APIs). Docs:
// https://docs.claude.com/en/api/messages
export class AnthropicAiProvider implements AiProvider {
  constructor(private config: AnthropicConfig) {}

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 500,
        system: input.systemPrompt,
        messages: input.conversationHistory.map((turn) => ({
          role: turn.role === "customer" ? "user" : "assistant",
          content: turn.text,
        })),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API call failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      content?: { type: string; text?: string }[];
      model?: string;
    };

    const textBlock = data.content?.find((block) => block.type === "text");
    if (!textBlock?.text) {
      throw new Error("Anthropic response did not include a text block");
    }

    return { rawResponseText: textBlock.text, model: data.model ?? this.config.model };
  }
}
