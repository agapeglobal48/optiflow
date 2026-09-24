// Feature flags let us roll out risky or partial features per-practice
// instead of globally (e.g. enabling AI auto-send only for practices that
// have finished reviewing their knowledge base). Every new practice gets
// these keys created at PENDING_SETUP/false so the rest of the codebase
// can always assume the row exists rather than treating "missing" as "off".
export const DEFAULT_FEATURE_FLAGS: { key: string; enabled: boolean }[] = [
  { key: "ai_auto_reply", enabled: false }, // stays off until AI settings + knowledge base reviewed
  { key: "external_calendar_sync", enabled: false },
  { key: "sms_fallback", enabled: false },
];
