import { describe, it, expect } from "vitest";
import {
  normalizeHeader,
  autoDetectMapping,
  parseCsvBuffer,
  applyMapping,
  validateMappedRow,
  parseLooseDate,
} from "../modules/customers/csvParsing";

describe("normalizeHeader", () => {
  it("lowercases and strips spaces/punctuation", () => {
    expect(normalizeHeader("First Name")).toBe("firstname");
    expect(normalizeHeader("first_name")).toBe("firstname");
    expect(normalizeHeader("First-Name")).toBe("firstname");
    expect(normalizeHeader(" Mobile Number ")).toBe("mobilenumber");
  });
});

describe("autoDetectMapping", () => {
  it("maps common header variants to the right fields", () => {
    const mapping = autoDetectMapping(["First Name", "Last Name", "Email", "Mobile", "Patient ID"]);
    expect(mapping.firstName).toBe("First Name");
    expect(mapping.lastName).toBe("Last Name");
    expect(mapping.email).toBe("Email");
    expect(mapping.mobile).toBe("Mobile");
    expect(mapping.externalId).toBe("Patient ID");
  });

  it("does not map headers it doesn't recognise", () => {
    const mapping = autoDetectMapping(["Some Random Column"]);
    expect(Object.keys(mapping)).toHaveLength(0);
  });

  it("handles a real-world messy header set", () => {
    const mapping = autoDetectMapping(["first_name", "surname", "e-mail", "cell", "next_exam"]);
    expect(mapping.firstName).toBe("first_name");
    expect(mapping.lastName).toBe("surname");
    expect(mapping.email).toBe("e-mail");
    expect(mapping.mobile).toBe("cell");
    expect(mapping.recallDueDate).toBe("next_exam");
  });
});

describe("parseCsvBuffer", () => {
  it("parses a simple CSV into records keyed by header", () => {
    const csv = "First Name,Mobile\nJane,07700900000\nJohn,07700900001\n";
    const { headers, records } = parseCsvBuffer(Buffer.from(csv));
    expect(headers).toEqual(["First Name", "Mobile"]);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ "First Name": "Jane", Mobile: "07700900000" });
  });

  it("strips a UTF-8 BOM if present", () => {
    const csv = "\uFEFFFirst Name,Mobile\nJane,07700900000\n";
    const { headers } = parseCsvBuffer(Buffer.from(csv));
    expect(headers[0]).toBe("First Name");
  });

  it("returns no records for an empty file", () => {
    const { records } = parseCsvBuffer(Buffer.from(""));
    expect(records).toHaveLength(0);
  });
});

describe("applyMapping", () => {
  it("pulls values from the mapped source columns", () => {
    const row = applyMapping(
      { "First Name": "Jane", Mobile: "07700900000" },
      { firstName: "First Name", mobile: "Mobile" },
    );
    expect(row).toEqual({ firstName: "Jane", mobile: "07700900000" });
  });

  it("omits fields where the source value is empty", () => {
    const row = applyMapping({ "First Name": "Jane", Mobile: "" }, { firstName: "First Name", mobile: "Mobile" });
    expect(row.mobile).toBeUndefined();
  });
});

describe("parseLooseDate", () => {
  it("parses ISO dates", () => {
    const d = parseLooseDate("2026-03-15");
    expect(d?.getFullYear()).toBe(2026);
  });

  it("parses DD/MM/YYYY dates", () => {
    const d = parseLooseDate("15/03/2026");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(2); // 0-indexed, March
    expect(d?.getDate()).toBe(15);
  });

  it("parses 2-digit years", () => {
    const d = parseLooseDate("15/03/26");
    expect(d?.getFullYear()).toBe(2026);
  });

  it("returns null for garbage input", () => {
    expect(parseLooseDate("not a date")).toBeNull();
  });
});

describe("validateMappedRow", () => {
  it("passes a row with a name and mobile number", () => {
    const result = validateMappedRow({ firstName: "Jane", mobile: "07700900000" });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes a row with a name and email only (no mobile)", () => {
    const result = validateMappedRow({ firstName: "Jane", email: "jane@example.com" });
    expect(result.valid).toBe(true);
  });

  it("fails a row with no first name", () => {
    const result = validateMappedRow({ mobile: "07700900000" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/first name/i);
  });

  it("fails a row with a name but no contact method", () => {
    const result = validateMappedRow({ firstName: "Jane" });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/mobile.*email|email.*mobile/i);
  });

  it("warns but does not fail on an unparsable recall date", () => {
    const result = validateMappedRow({ firstName: "Jane", mobile: "07700900000", recallDueDate: "not-a-date" });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.recallDueDate).toBeNull();
  });

  it("successfully parses a valid recall date", () => {
    const result = validateMappedRow({ firstName: "Jane", mobile: "07700900000", recallDueDate: "2026-06-01" });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.recallDueDate).not.toBeNull();
  });
});
