import { describe, it, expect } from "vitest";
import { buildSystemPrompt, PROMPT_VERSION } from "../modules/ai/promptBuilder";

describe("buildSystemPrompt", () => {
  it("includes the practice name and customer's first name", () => {
    const prompt = buildSystemPrompt({
      practiceName: "Demo Optical Practice",
      customerFirstName: "Jane",
      knowledgeBase: [],
    });
    expect(prompt).toContain("Demo Optical Practice");
    expect(prompt).toContain("Jane");
  });

  it("includes every knowledge base fact provided", () => {
    const prompt = buildSystemPrompt({
      practiceName: "Demo Optical",
      customerFirstName: "Jane",
      knowledgeBase: [
        { topic: "hours", answer: "We're open 9-5 Mon-Fri" },
        { topic: "prices", question: "How much is an eye test?", answer: "£25" },
      ],
    });
    expect(prompt).toContain("We're open 9-5 Mon-Fri");
    expect(prompt).toContain("How much is an eye test?");
    expect(prompt).toContain("£25");
  });

  it("shows a placeholder when the knowledge base is empty", () => {
    const prompt = buildSystemPrompt({ practiceName: "Demo", customerFirstName: "Jane", knowledgeBase: [] });
    expect(prompt).toContain("No knowledge base entries configured");
  });

  it("instructs the model never to invent prices or availability", () => {
    const prompt = buildSystemPrompt({ practiceName: "Demo", customerFirstName: "Jane", knowledgeBase: [] });
    expect(prompt.toLowerCase()).toContain("never invent");
  });

  it("instructs the model to escalate clinical topics", () => {
    const prompt = buildSystemPrompt({ practiceName: "Demo", customerFirstName: "Jane", knowledgeBase: [] });
    expect(prompt.toLowerCase()).toContain("clinical");
    expect(prompt.toLowerCase()).toContain("escalate");
  });

  it("specifies the required JSON response shape", () => {
    const prompt = buildSystemPrompt({ practiceName: "Demo", customerFirstName: "Jane", knowledgeBase: [] });
    expect(prompt).toContain('"escalate"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"reply"');
  });

  it("exports a stable, non-empty prompt version identifier", () => {
    expect(PROMPT_VERSION).toBeTruthy();
    expect(typeof PROMPT_VERSION).toBe("string");
  });
});
