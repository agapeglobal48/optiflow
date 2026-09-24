import { describe, it, expect } from "vitest";
import { variablesFromSnapshotName, renderTemplate } from "../modules/messaging/templateRendering";

describe("variablesFromSnapshotName", () => {
  it("extracts the first word as firstName", () => {
    expect(variablesFromSnapshotName("Jane Smith")).toEqual({ name: "Jane Smith", firstName: "Jane" });
  });

  it("handles a single-word name", () => {
    expect(variablesFromSnapshotName("Madonna")).toEqual({ name: "Madonna", firstName: "Madonna" });
  });

  it("handles extra whitespace", () => {
    expect(variablesFromSnapshotName("  Jane   Smith  ")).toEqual({
      name: "  Jane   Smith  ",
      firstName: "Jane",
    });
  });
});

describe("renderTemplate", () => {
  it("substitutes {{name}}", () => {
    const result = renderTemplate("Hi {{name}}, thanks!", { name: "Jane Smith", firstName: "Jane" });
    expect(result).toBe("Hi Jane Smith, thanks!");
  });

  it("substitutes {{firstName}}", () => {
    const result = renderTemplate("Hi {{firstName}}!", { name: "Jane Smith", firstName: "Jane" });
    expect(result).toBe("Hi Jane!");
  });

  it("is case-insensitive and tolerates extra spaces inside braces", () => {
    const result = renderTemplate("Hi {{ FirstName }}!", { name: "Jane Smith", firstName: "Jane" });
    expect(result).toBe("Hi Jane!");
  });

  it("substitutes multiple occurrences", () => {
    const result = renderTemplate("{{firstName}}, hi {{firstName}}!", { name: "Jane Smith", firstName: "Jane" });
    expect(result).toBe("Jane, hi Jane!");
  });

  it("leaves unrecognised variables untouched", () => {
    const result = renderTemplate("Hi {{firstName}}, your {{branch}} awaits", {
      name: "Jane Smith",
      firstName: "Jane",
    });
    expect(result).toBe("Hi Jane, your {{branch}} awaits");
  });

  it("passes through text with no variables at all", () => {
    const result = renderTemplate("Hello there!", { name: "Jane Smith", firstName: "Jane" });
    expect(result).toBe("Hello there!");
  });
});
