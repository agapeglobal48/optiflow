import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { Plus, FileText } from "lucide-react";
import { fetchCampaigns, fetchMessageTemplates } from "@/lib/campaigns";
import { useAuth } from "@/lib/authContext";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { CampaignBuilder } from "@/components/CampaignBuilder";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import type { CampaignStatus } from "@/types/campaign";

const STATUS_TONE: Record<CampaignStatus, "default" | "good" | "warning" | "critical"> = {
  DRAFT: "default",
  SCHEDULED: "default",
  RUNNING: "good",
  PAUSED: "warning",
  COMPLETED: "good",
  STOPPED: "critical",
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RUNNING: "Running",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  STOPPED: "Stopped",
};

export function CampaignsPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"campaigns" | "templates">("campaigns");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);

  const canCreate = hasPermission("campaigns:create");

  const campaignsQuery = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns, enabled: tab === "campaigns" });
  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: fetchMessageTemplates,
    enabled: tab === "templates",
  });

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">Recall outreach sent over WhatsApp.</p>
        </div>
        {canCreate && tab === "campaigns" && (
          <button
            onClick={() => setBuilderOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </button>
        )}
        {canCreate && tab === "templates" && (
          <button
            onClick={() => setNewTemplateOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New template
          </button>
        )}
      </div>

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        {(["campaigns", "templates"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize",
              tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "campaigns" && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {campaignsQuery.isLoading && <p className="p-6 text-sm text-slate-400">Loading campaigns&hellip;</p>}
          {campaignsQuery.isError && (
            <p className="p-6 text-sm text-red-600">Could not load campaigns - is the API running?</p>
          )}
          {campaignsQuery.data && campaignsQuery.data.length === 0 && (
            <p className="p-6 text-sm text-slate-400">No campaigns yet - create one to start recalling patients.</p>
          )}
          {campaignsQuery.data && campaignsQuery.data.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Audience</th>
                  <th className="px-4 py-3 font-medium">Launched</th>
                </tr>
              </thead>
              <tbody>
                {campaignsQuery.data.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/campaigns/${c.id}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">{c.templateType.label}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.estimatedAudienceSize !== null ? formatNumber(c.estimatedAudienceSize) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(c.launchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "templates" && (
        <div className="mt-4">
          {newTemplateOpen && (
            <div className="mb-4">
              <NewTemplateForm onCancel={() => setNewTemplateOpen(false)} onCreated={() => setNewTemplateOpen(false)} />
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {templatesQuery.isLoading && <p className="p-6 text-sm text-slate-400">Loading templates&hellip;</p>}
            {templatesQuery.isError && (
              <p className="p-6 text-sm text-red-600">Could not load templates - is the API running?</p>
            )}
            {templatesQuery.data && templatesQuery.data.length === 0 && (
              <p className="p-6 text-sm text-slate-400">No templates yet - create one to use in a campaign.</p>
            )}
            {templatesQuery.data && templatesQuery.data.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {templatesQuery.data.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{t.name}</span>
                        <Badge tone={t.isApproved ? "good" : "warning"}>
                          {t.isApproved ? "Approved" : "Pending approval"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{t.providerTemplateName}</p>
                      <p className="mt-1 text-sm text-slate-600">{t.bodyPreview}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {builderOpen && (
        <CampaignBuilder
          onClose={() => setBuilderOpen(false)}
          onCreated={(campaignId) => {
            setBuilderOpen(false);
            navigate(`/campaigns/${campaignId}`);
          }}
        />
      )}
    </div>
  );
}
