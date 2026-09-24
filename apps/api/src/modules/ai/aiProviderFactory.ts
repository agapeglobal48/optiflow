import { env } from "../../config/env";
import { AiProvider } from "./aiProvider";
import { MockAiProvider } from "./mockAiProvider";
import { AnthropicAiProvider } from "./anthropicProvider";

let cachedProvider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cachedProvider) return cachedProvider;

  if (env.AI_PROVIDER === "anthropic") {
    cachedProvider = new AnthropicAiProvider({
      apiKey: env.ANTHROPIC_API_KEY!, // env.ts validates this is present when AI_PROVIDER=anthropic
      model: env.ANTHROPIC_MODEL,
    });
  } else {
    cachedProvider = new MockAiProvider();
  }

  return cachedProvider;
}
