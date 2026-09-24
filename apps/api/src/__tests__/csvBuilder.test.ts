import { describe, it, expect } from "vitest";
import { toCsv } from "../modules/reports/csvBuilder";

interface Row {
  name: string;
  count: number;
  note: string | null;
}

const columns = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Count", value: (r: Row) => r.count },
  { header: "Note", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("produces a header row plus one row per input, CRLF-terminated", () => {
    const csv = toCsv<Row>([{ name: "Alice", count: 3, note: "vip" }], columns);
    expect(csv).toBe("Name,Count,Note\r\nAlice,3,vip\r\n");
  });

  it("handles an empty row set (header only)", () => {
    const csv = toCsv<Row>([], columns);
    expect(csv).toBe("Name,Count,Note\r\n");
  });

  it("renders null/undefined as an empty field", () => {
    const csv = toCsv<Row>([{ name: "Bob", count: 0, note: null }], columns);
    expect(csv).toBe("Name,Count,Note\r\nBob,0,\r\n");
  });

  it("quotes and escapes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv<Row>(
      [{ name: 'Smith, "Bob"', count: 1, note: "line1\nline2" }],
      columns,
    );
    expect(csv).toBe('Name,Count,Note\r\n"Smith, ""Bob""",1,"line1\nline2"\r\n');
  });

  it("does not quote a plain field with no special characters", () => {
    const csv = toCsv<Row>([{ name: "Priya", count: 5, note: "ok" }], columns);
    expect(csv).toContain("Priya,5,ok");
  });
});
