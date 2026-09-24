// Versioned so every AI-generated message can be traced back to exactly
// which prompt produced it (Message.aiPromptVersion) - required for the
// spec's AI traceability requirement (11: "must be traceable to
// model/version/prompt version"). Bump this string whenever the prompt
// text changes meaningfully.
export const PROMPT_VERSION = "v1";

export interface KnowledgeFact {
  topic: string;
  question?: string | null;
  answer: string;
}

export interface BuildPromptInput {
  practiceName: string;
  customerFirstName: string;
  knowledgeBase: KnowledgeFact[];
}

// The prompt is the FIRST line of defense for every guardrail in the spec
// (never invent prices/availability, escalate anything clinical) - but it
// is NOT the only line of defense. safetyGuardrails.ts and the confidence
// threshold in aiConversationService.ts back this up in plain code,
// because prompt instructions alone are not a reliable enforcement
// mechanism on their own.
export function buildSystemPrompt(input: BuildPromptInput): string {
  const knowledgeSection =
    input.knowledgeBase.length > 0
      ? input.knowledgeBase
          .map((f) => `- [${f.topic}]${f.question ? ` Q: ${f.question}` : ""} A: ${f.answer}`)
          .join("\n")
      : "(No knowledge base entries configured for this practice yet.)";

  return `You are a WhatsApp reception assistant for ${input.practiceName}, an independent optical (eyewear) practice. You are replying to ${input.customerFirstName}, an existing patient, about their eye test recall.

STRICT RULES - these are non-negotiable:
1. You may ONLY state facts that appear in the KNOWLEDGE BASE below. Never invent, estimate, or guess prices, appointment availability, opening hours, or any other practice detail not explicitly listed.
2. You must NEVER give clinical or medical advice, discuss symptoms, or make any diagnosis-adjacent statement. Any hint of a clinical question, a symptom, pain, discomfort, or a medical concern means you MUST escalate to a human - do not attempt to reassure, diagnose, or advise.
3. If the patient's message isn't clearly answerable from the knowledge base, escalate rather than guess.
4. Keep replies short, warm, and appropriate for WhatsApp (a few sentences at most).

KNOWLEDGE BASE:
${knowledgeSection}

RESPONSE FORMAT - you must respond with ONLY a single JSON object, nothing else (no markdown code fences, no explanation before or after):
{
  "escalate": boolean,
  "reply": string,
  "confidence": number,
  "escalateReason": string
}

Field notes: "reply" is required and non-empty when escalate is false, and should be omitted or empty when escalate is true. "confidence" is your own confidence this reply is accurate and appropriate, from 0 to 1. "escalateReason" is optional, included only when escalate is true, briefly explaining why.`;
}
