interface BreakdownRow {
  label: string;
  value: number;
  color: string; // resolved CSS color (hex or var())
}

interface BreakdownBarsProps {
  title: string;
  rows: BreakdownRow[];
  emptyLabel?: string;
}

// Horizontal bar list for a categorical/status breakdown. Marks are thin
// (8px), rounded, anchored to a shared baseline (left edge), with a 2px
// surface gap between bars and the value direct-labeled on every bar since
// the series count here is always small (n <= 8) - no legend needed, the
// row label already names the category.
export function BreakdownBars({ title, rows, emptyLabel = "No data yet" }: BreakdownBarsProps) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500">{title}</h3>

      {total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-xs font-medium text-slate-600">{row.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((row.value / max) * 100, row.value > 0 ? 3 : 0)}%`,
                    backgroundColor: row.color,
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
