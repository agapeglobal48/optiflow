interface Segment {
  label: string;
  value: number;
  color: string;
}

interface SegmentedBarProps {
  title: string;
  segments: Segment[];
  emptyLabel?: string;
}

// A single stacked bar splitting a total across 2+ categories (e.g. AI vs
// staff-sent messages). Two or more series always gets a legend with direct
// labels - identity never rides on color alone. Segments get a 2px surface
// gap so adjacent fills don't visually merge.
export function SegmentedBar({ title, segments, emptyLabel = "No data yet" }: SegmentedBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500">{title}</h3>

      {total === 0 ? (
        <p className="mt-4 text-sm text-slate-400">{emptyLabel}</p>
      ) : (
        <>
          <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full">
            {segments.map((s) => (
              <div
                key={s.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              />
            ))}
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <dt className="text-slate-600">{s.label}</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
