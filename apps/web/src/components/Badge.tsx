import type { ReactNode } from "react";
import { clsx } from "clsx";

interface BadgeProps {
  children: ReactNode;
  tone?: "default" | "good" | "warning" | "critical";
}

// Status labelling, not a chart mark - always icon/text, never color alone,
// consistent with how the dashboard treats status colors as reserved.
const TONE_STYLES: Record<NonNullable<BadgeProps["tone"]>, string> = {
  default: "bg-slate-100 text-slate-600",
  good: "bg-viz-good/10 text-viz-good",
  warning: "bg-viz-warning/15 text-amber-700",
  critical: "bg-viz-critical/10 text-viz-critical",
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
      )}
    >
      {children}
    </span>
  );
}
