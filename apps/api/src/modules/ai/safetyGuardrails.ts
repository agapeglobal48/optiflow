// Deterministic, code-level safety net - independent of whatever the model
// decides. Even if the model's own judgment or the prompt instructions
// somehow failed, these checks run in plain code and cannot be talked out
// of escalating. This is the "must escalate anything clinical" requirement
// enforced structurally, not just requested via a system prompt.

// A baseline set of terms that ALWAYS force escalation, regardless of what
// a practice configures in their own AiSettings.blocklistTerms. A practice
// leaving their custom list empty must never accidentally disable this.
const BASELINE_ESCALATION_TERMS = [
  "emergency",
  "urgent",
  "severe pain",
  "bleeding",
  "blind",
  "vision loss",
  "lost my vision",
  "can't see",
  "allergic reaction",
  "swelling",
  "infection",
  "injury",
  "accident",
  "chemical in my eye",
  "foreign object",
  "stuck in my eye",
  "complaint",
  "refund",
  "legal action",
  "sue",
];

export interface BlocklistCheckResult {
  hit: boolean;
  matchedTerm?: string;
  source?: "baseline" | "practice";
}

export function checkBlocklist(text: string, practiceBlocklistTerms: string[]): BlocklistCheckResult {
  const normalized = text.toLowerCase();

  for (const term of BASELINE_ESCALATION_TERMS) {
    if (normalized.includes(term.toLowerCase())) {
      return { hit: true, matchedTerm: term, source: "baseline" };
    }
  }

  for (const term of practiceBlocklistTerms) {
    if (term.trim() !== "" && normalized.includes(term.toLowerCase())) {
      return { hit: true, matchedTerm: term, source: "practice" };
    }
  }

  return { hit: false };
}
