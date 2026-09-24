import { describe, it, expect } from "vitest";
import { parseAiResponse } from "../modules/ai/aiResponseParsing";

describe("parseAiResponse", () => {
  it("parses a valid non-escalating response", () => {
    const raw = JSON.stringify({ escalate: false, reply: "Sure, happy to help!", confidence: 0.9 });
    const result = parseAiResponse(raw);
    expect(result).toEqual({ reply: "Sure, happy to help!", confidence: 0.9, escalate: false });
  });

  it("parses a valid escalating response", () => {
    const raw = JSON.stringify({ escalate: true, confidence: 0.3, escalateReason: "Not sure" });
    const result = parseAiResponse(raw);
    expect(result.escalate).toBe(true);
    expect(result.escalateReason).toBe("Not sure");
  });

  it("strips markdown code fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify({ escalate: false, reply: "Hi!", confidence: 0.8 }) + "\n```";
    const result = parseAiResponse(raw);
    expect(result.escalate).toBe(false);
    expect(result.reply).toBe("Hi!");
  });

  it("falls back to escalate on completely invalid JSON", () => {
    const result = parseAiResponse("this is not json at all");
    expect(result.escalate).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it("falls back to escalate when the JSON is an array, not an object", () => {
    const result = parseAiResponse("[1, 2, 3]");
    expect(result.escalate).toBe(true);
  });

  it("falls back to escalate when escalate is false but reply is missing", () => {
    const raw = JSON.stringify({ escalate: false, confidence: 0.9 });
    const result = parseAiResponse(raw);
    expect(result.escalate).toBe(true);
  });

  it("falls back to escalate when escalate is false but reply is an empty string", () => {
    const raw = JSON.stringify({ escalate: false, reply: "   ", confidence: 0.9 });
    const result = parseAiResponse(raw);
    expect(result.escalate).toBe(true);
  });

  it("defaults escalate to true when the field is missing entirely", () => {
    const raw = JSON.stringify({ confidence: 0.9 });
    const result = parseAiResponse(raw);
    expect(result.escalate).toBe(true);
  });

  it("clamps an out-of-range confidence value to [0,1]", () => {
    const tooHigh = parseAiResponse(JSON.stringify({ escalate: true, confidence: 5 }));
    expect(tooHigh.confidence).toBe(1);
    const negative = parseAiResponse(JSON.stringify({ escalate: true, confidence: -3 }));
    expect(negative.confidence).toBe(0);
  });

  it("defaults confidence to 0 when missing or not a number", () => {
    const result = parseAiResponse(JSON.stringify({ escalate: true, confidence: "high" }));
    expect(result.confidence).toBe(0);
  });

  it("trims whitespace from a valid reply", () => {
    const raw = JSON.stringify({ escalate: false, reply: "  Hello there  ", confidence: 0.9 });
    const result = parseAiResponse(raw);
    expect(result.reply).toBe("Hello there");
  });
});
