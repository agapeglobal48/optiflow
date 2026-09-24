import { useQuery } from "@tanstack/react-query";
import { Users, Clock, Megaphone, CalendarCheck, AlertTriangle, Bot } from "lucide-react";
import { fetchOverview } from "@/lib/reports";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { BreakdownBars } from "@/components/BreakdownBars";
import { SegmentedBar } from "@/components/SegmentedBar";
import type { ConversationStatus } from "@/types/reports";

const CONVERSATION_STATUS_ORDER: { key: ConversationStatus; label: string; color: string }[] = [
  { key: "AI_HANDLING", label: "AI handling", color: "var(--color-viz-cat-1)" },
  { key: "WAITING_ON_CUSTOMER", label: "Waiting on customer", color: "var(--color-viz-cat-2)" },
  { key: "HUMAN_QUEUE", label: "Human queue", color: "var(--color-viz-cat-3)" },
  { key: "HUMAN_HANDLING", label: "Human handling", color: "var(--color-viz-cat-4)" },
  { key: "BOOKED", label: "Booked", color: "var(--color-viz-cat-5)" },
  { key: "CLOSED", label: "Closed", color: "var(--color-viz-cat-6)" },
];

export function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: fetchOverview,
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">How revenue recovery is going right now.</p>

      {isLoading && <p className="mt-6 text-sm text-slate-400">Loading overview&hellip;</p>}
      {isError && (
        <p className="mt-6 text-sm text-red-600">Could not load the dashboard - is the API running?</p>
      )}

      {data && (
        <div className="mt-6 space-y-6">
          {/* Headline: revenue recovered is the single number this whole
              product exists to move, so it gets the largest tile. */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-6 shadow-sm">
            <p className="text-sm font-medium text-indigo-700">Estimated revenue recovered</p>
            <p className="mt-1.5 text-4xl font-semibold text-indigo-950">
              {formatCurrency(data.revenue.estimatedRecovered)}
            </p>
            <p className="mt-1.5 text-xs text-indigo-700/80">
              {data.bookings.byStatus.BOOKED + data.bookings.byStatus.COMPLETED} honoured booking
              {data.bookings.byStatus.BOOKED + data.bookings.byStatus.COMPLETED === 1 ? "" : "s"}
              {data.revenue.appointmentValue !== null &&
                ` × ${formatCurrency(data.revenue.appointmentValue)} avg. appointment value`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total customers"
              value={formatNumber(data.customers.total)}
              icon={Users}
            />
            <StatCard
              label="Overdue for recall"
              value={formatNumber(data.customers.overdueForRecall)}
              icon={Clock}
              tone={data.customers.overdueForRecall > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Campaigns launched"
              value={formatNumber(data.campaigns.launched)}
              icon={Megaphone}
            />
            <StatCard
              label="Bookings"
              value={formatNumber(data.bookings.total)}
              sublabel={`${formatPercent(data.bookings.noShowRate)} no-show rate`}
              icon={CalendarCheck}
              tone={
                data.bookings.noShowRate !== null && data.bookings.noShowRate > 0.15 ? "critical" : "default"
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SegmentedBar
              title="Outbound messages by sender"
              segments={[
                { label: "Sent by AI", value: data.messages.byAi, color: "var(--color-viz-cat-1)" },
                { label: "Sent by staff", value: data.messages.byStaff, color: "var(--color-viz-cat-6)" },
                {
                  label: "System (templates, reminders)",
                  value: Math.max(data.messages.outboundTotal - data.messages.byAi - data.messages.byStaff, 0),
                  color: "var(--color-viz-cat-3)",
                },
              ]}
            />
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-medium text-slate-500">Automation share</h3>
              <div className="mt-1.5 flex items-center gap-2">
                <Bot className="h-4 w-4 text-slate-400" aria-hidden />
                <p className="text-2xl font-semibold text-slate-900">{formatPercent(data.messages.aiShare)}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                of {formatNumber(data.messages.outboundTotal)} outbound messages were handled without a staff
                reply.
              </p>
              {data.bookings.noShowRate !== null && data.bookings.noShowRate > 0.15 && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-viz-critical">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  No-show rate is above 15% - worth a look.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownBars
              title="Conversations by status"
              rows={CONVERSATION_STATUS_ORDER.map((s) => ({
                label: s.label,
                value: data.conversations.byStatus[s.key] ?? 0,
                color: s.color,
              }))}
            />
            <BreakdownBars
              title="Bookings by status"
              rows={[
                { label: "Booked", value: data.bookings.byStatus.BOOKED, color: "var(--color-viz-cat-1)" },
                { label: "Completed", value: data.bookings.byStatus.COMPLETED, color: "var(--color-viz-good)" },
                { label: "Cancelled", value: data.bookings.byStatus.CANCELLED, color: "var(--color-viz-warning)" },
                { label: "No-show", value: data.bookings.byStatus.NO_SHOW, color: "var(--color-viz-critical)" },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
