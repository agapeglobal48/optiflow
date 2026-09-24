import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface StatCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "warning" | "critical";
}

const TONE_STYLES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-indigo-50 text-indigo-700",
  good: "bg-viz-good/10 text-viz-good",
  warning: "bg-viz-warning/15 text-amber-700",
  critical: "bg-viz-critical/10 text-viz-critical",
};

// A stat tile: the number IS the chart. No plot, so no interaction layer
// needed (dataviz skill: "the only form that skips it is a bare stat tile").
export function StatCard({ label, value, sublabel, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900">{value}</p>
          {sublabel && <p className="mt-1 text-xs text-slate-500">{sublabel}</p>}
        </div>
        <div className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE_STYLES[tone])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}
