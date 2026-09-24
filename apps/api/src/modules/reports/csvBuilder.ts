// Pure CSV serialization - no DB import, unit tested directly. Deliberately
// hand-rolled rather than pulling in a new dependency (e.g. csv-stringify):
// this codebase already depends on csv-parse for CSV *import* (Phase 3), and
// export is simple enough not to justify a second CSV library plus its own
// security-advisory surface to track (see README's "known gotchas" on
// dependency upgrades from earlier phases).

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const v = c.value(row);
        return escapeCsvField(v === null || v === undefined ? "" : String(v));
      })
      .join(","),
  );
  return [headerLine, ...lines].join("\r\n") + "\r\n";
}
