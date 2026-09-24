// The model is instructed (via the system prompt in promptBuilder.ts) to
// respond with ONLY a JSON object matching this shape. This function is
// the single place that trusts (or refuses to trust) that output - kept
// separate from any specific provider so every provider's output is
// validated identically, and so a malformed/unparseable response NEVER
// causes an auto-send: it always safely falls back to escalation instead.

export interface ParsedAiResponse {
  reply: string;
  confidence: number; // 0-1
  escalate: boolean;
  escalateReason?: string;
}

const FALLBACK_ESCALATE: ParsedAiResponse = {
  reply: "",
  confidence: 0,
  escalate: true,
  escalateReason: "AI response could not be parsed or validated",
};

export function parseAiResponse(rawText: string): ParsedAiResponse {
  let candidate: unknown;

  try {
    // Models sometimes wrap JSON in markdown code fences despite
    // instructions not to - strip those defensively before parsing.
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    candidate = JSON.parse(cleaned);
  } catch {
    return FALLBACK_ESCALATE;
  }

  if (typeof candidate !== "object" || candidate === null) {
    return FALLBACK_ESCALATE;
  }

  const obj = candidate as Record<string, unknown>;

  // escalate defaults to true if missing/invalid - fail toward the safer
  // outcome (a human sees it) rather than the more convenient one.
  const escalate = typeof obj.escalate === "boolean" ? obj.escalate : true;

  const rawConfidence = typeof obj.confidence === "number" ? obj.confidence : 0;
  const confidence = Math.max(0, Math.min(1, rawConfidence)); // clamp to [0,1]

  const escalateReason = typeof obj.escalateReason === "string" ? obj.escalateReason : undefined;

  if (escalate) {
    return { reply: "", confidence, escalate: true, escalateReason };
  }

  // Not escalating - a non-empty reply string is mandatory, otherwise
  // we'd be about to auto-send nothing/garbage to a real customer.
  if (typeof obj.reply !== "string" || obj.reply.trim() === "") {
    return FALLBACK_ESCALATE;
  }

  return { reply: obj.reply.trim(), confidence, escalate: false };
}
