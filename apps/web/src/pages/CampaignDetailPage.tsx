import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AxiosError } from "axios";
import { ArrowLeft, Play, Pause, Square, RotateCcw } from "lucide-react";
import {
  fetchCampaign,
  fetchCampaignRecipients,
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
} from "@/lib/campaigns";
import { useAuth } from "@/lib/authContext";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { BreakdownBars } from "@/components/BreakdownBars";
import type { CampaignStatus } from "@/types/campaign";

const STATUS_TONE: Record<CampaignStatus, "default" | "good" | "warning" | "critical"> = {
  DRAFT: "default",
  SCHEDULED: "default",
  RUNNING: "good",
  PAUSED: "warning",
  COMPLETED: "good",
  STOPPED: "critical",
};

const RECIPIENT_STATUS_ORDER: { key: string; label: string; color: string }[] = [
  { key: "queued", label: "Queued", color: "var(--color-viz-cat-1)" },
  { key: "sent", label: "Sent", color: "var(--color-viz-cat-2)" },
  { key: "delivered", label: "Delivered", color: "var(--color-viz-cat-3)" },
  { key: "replied", label: "Replied", color: "var(--color-viz-cat-4)" },
  { key: "booked", label: "Booked", color: "var(--color-viz-good)" },
  { key: "failed", label: "Failed", color: "var(--color-viz-critical)" },
];

const RECIPIENTS_SHOWN = 200;

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const campaignQuery = useQuery({
    queryKey: ["campaigns", id],
    queryFn: () => fetchCampaign(id!),
    enabled: !!id,
  });
  const recipientsQuery = useQuery({
    queryKey: ["campaigns", id, "recipients"],
    queryFn: () => fetchCampaignRecipients(id!),
    enabled: !!id,
  });

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of recipientsQuery.data ?? []) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return counts;
  }, [recipientsQuery.data]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    void queryClient.invalidateQueries({ queryKey: ["campaigns", id] });
    void queryClient.invalidateQueries({ queryKey: ["campaigns", id, "recipients"] });
  }

  function onActionError(err: unknown) {
    if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
      setActionError(err.response.data.error.message);
    } else {
      setActionError("That action failed. Please try again.");
    }
  }

  const launchMutation = useMutation({
    mutationFn: () => launchCampaign(id!),
    onSuccess: invalidate,
    onError: onActionError,
  });
  const pauseMutation = useMutation({ mutationFn: () => pauseCampaign(id!), onSuccess: invalidate, onError: onActionError });
  const resumeMutation = useMutation({ mutationFn: () => resumeCampaign(id!), onSuccess: invalidate, onError: onActionError });
  const stopMutation = useMutation({ mutationFn: () => stopCampaign(id!), onSuccess: invalidate, onError: onActionError });

  const isActionPending =
    launchMutation.isPending || pauseMutation.isPending || resumeMutation.isPending || stopMutation.isPending;

  if (campaignQuery.isLoading) {
    return <div className="p-8 text-sm text-slate-400">Loading campaign&hellip;</div>;
  }
  if (campaignQuery.isError || !campaignQuery.data) {
    return <div className="p-8 text-sm text-red-600">Could not load this campaign.</div>;
  }

  const campaign = campaignQuery.data;
  const recipients = recipientsQuery.data ?? [];

  return (
    <div className="p-8">
      <button
        onClick={() => navigate("/campaigns")}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Campaigns
      </button>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
            <Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {campaign.templateType.label} · using template "{campaign.messageTemplate.name}"
          </p>
        </div>

        <div className="flex gap-2">
          {hasPermission("campaigns:launch") && (campaign.status === "DRAFT" || campaign.status === "SCHEDULED") && (
            <button
              onClick={() => launchMutation.mutate()}
              disabled={isActionPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" />
              Launch
            </button>
          )}
          {hasPermission("campaigns:pause_stop") && campaign.status === "RUNNING" && (
            <>
              <button
                onClick={() => pauseMutation.mutate()}
                disabled={isActionPending}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
              <button
                onClick={() => stopMutation.mutate()}
                disabled={isActionPending}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-viz-critical hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          )}
          {hasPermission("campaigns:pause_stop") && campaign.status === "PAUSED" && (
            <>
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={isActionPending}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                Resume
              </button>
              <button
                onClick={() => stopMutation.mutate()}
                disabled={isActionPending}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-viz-critical hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Square className="h-4 w-4" />
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Audience size</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {campaign.estimatedAudienceSize !== null ? formatNumber(campaign.estimatedAudienceSize) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Suppressed at launch</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {campaign.suppressedCount !== null ? formatNumber(campaign.suppressedCount) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Launched</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatDateTime(campaign.launchedAt)}</p>
        </div>
      </div>

      <div className="mt-4">
        <BreakdownBars
          title="Recipients by status"
          rows={RECIPIENT_STATUS_ORDER.map((s) => ({
            label: s.label,
            value: statusCounts[s.key] ?? 0,
            color: s.color,
          }))}
          emptyLabel="Recipients appear here once the campaign is launched."
        />
      </div>

      {recipients.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {recipients.slice(0, RECIPIENTS_SHOWN).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.snapshotName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.snapshotContact}</td>
                  <td className="px-4 py-3">
                    <Badge tone={r.status === "failed" ? "critical" : r.status === "booked" ? "good" : "default"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(r.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recipients.length > RECIPIENTS_SHOWN && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Showing first {RECIPIENTS_SHOWN} of {formatNumber(recipients.length)} recipients.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
