import { describe, it, expect } from "vitest";
import { checkBlocklist } from "../modules/ai/safetyGuardrails";

describe("checkBlocklist", () => {
  it("does not hit on an ordinary message", () => {
    const result = checkBlocklist("Yes please, I'd like to book an eye test", []);
    expect(result.hit).toBe(false);
  });

  it("hits on a baseline clinical/emergency term even with an empty practice blocklist", () => {
    const result = checkBlocklist("I have severe pain in my eye", []);
    expect(result.hit).toBe(true);
    expect(result.source).toBe("baseline");
  });

  it("is case-insensitive for baseline terms", () => {
    const result = checkBlocklist("EMERGENCY please help", []);
    expect(result.hit).toBe(true);
  });

  it("hits on a practice-specific custom term", () => {
    const result = checkBlocklist("I want to talk about my invoice dispute", ["invoice dispute"]);
    expect(result.hit).toBe(true);
    expect(result.source).toBe("practice");
  });

  it("baseline terms cannot be bypassed by an empty or irrelevant practice list", () => {
    const result = checkBlocklist("This is an emergency", ["unrelated term"]);
    expect(result.hit).toBe(true);
    expect(result.source).toBe("baseline");
  });

  it("ignores empty strings in the practice blocklist", () => {
    const result = checkBlocklist("A normal message", ["", "  "]);
    expect(result.hit).toBe(false);
  });

  it("matches a baseline term as a substring within a longer message", () => {
    const result = checkBlocklist("Hi, I think I might be having an allergic reaction to something", []);
    expect(result.hit).toBe(true);
    expect(result.matchedTerm).toBe("allergic reaction");
  });
});
