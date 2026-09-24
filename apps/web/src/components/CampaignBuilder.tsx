import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { X, Users, Plus } from "lucide-react";
import { fetchCampaignTemplateTypes, fetchMessageTemplates, previewAudience, createCampaign } from "@/lib/campaigns";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { NewTemplateForm } from "@/components/NewTemplateForm";
import type { AudienceFilter } from "@/types/campaign";

interface CampaignBuilderProps {
  onClose: () => void;
  onCreated: (campaignId: string) => void;
}

export function CampaignBuilder({ onClose, onCreated }: CampaignBuilderProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [templateTypeKey, setTemplateTypeKey] = useState("");
  const [messageTemplateId, setMessageTemplateId] = useState("");
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [recallDueBefore, setRecallDueBefore] = useState("");
  const [recallDueAfter, setRecallDueAfter] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: templateTypes } = useQuery({
    queryKey: ["campaign-template-types"],
    queryFn: fetchCampaignTemplateTypes,
  });
  const { data: templates } = useQuery({
    queryKey: ["message-templates"],
    queryFn: fetchMessageTemplates,
  });

  // Memoized on just the filter fields (not name/template selection) so
  // typing elsewhere doesn't create a new object reference and keep
  // resetting the debounce timer below.
  const filter: AudienceFilter = useMemo(
    () => ({
      ...(recallDueBefore ? { recallDueBefore: new Date(recallDueBefore).toISOString() } : {}),
      ...(recallDueAfter ? { recallDueAfter: new Date(recallDueAfter).toISOString() } : {}),
      ...(appointmentType ? { appointmentType } : {}),
    }),
    [recallDueBefore, recallDueAfter, appointmentType],
  );
  const debouncedFilter = useDebouncedValue(filter, 400);

  const { data: audiencePreview, isFetching: isPreviewLoading } = useQuery({
    queryKey: ["audience-preview", debouncedFilter],
    queryFn: () => previewAudience(debouncedFilter),
  });

  const mutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onCreated(campaign.id);
    },
    onError: (err) => {
      if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
        setError(err.response.data.error.message);
      } else {
        setError("Could not create the campaign. Please try again.");
      }
    },
  });

  const canSubmit = name.trim() !== "" && templateTypeKey !== "" && messageTemplateId !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    mutation.mutate({ name: name.trim(), templateTypeKey, messageTemplateId, audienceFilter: filter });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">New campaign</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Campaign name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="September eye test recall"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Campaign type</label>
            <select
              required
              value={templateTypeKey}
              onChange={(e) => setTemplateTypeKey(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="" disabled>
                Select a type&hellip;
              </option>
              {templateTypes?.map((t) => (
                <option key={t.id} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Message template</label>
              {!showNewTemplate && (
                <button
                  type="button"
                  onClick={() => setShowNewTemplate(true)}
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New template
                </button>
              )}
            </div>

            {showNewTemplate ? (
              <NewTemplateForm
                onCancel={() => setShowNewTemplate(false)}
                onCreated={(template) => {
                  setMessageTemplateId(template.id);
                  setShowNewTemplate(false);
                }}
              />
            ) : (
              <>
                <select
                  required
                  value={messageTemplateId}
                  onChange={(e) => setMessageTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="" disabled>
                    Select a template&hellip;
                  </option>
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isApproved ? "" : "(pending approval)"}
                    </option>
                  ))}
                </select>
                {templates?.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">No templates yet - create one above.</p>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-medium text-slate-700">Audience filter</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Recall due on/after</label>
                <input
                  type="date"
                  value={recallDueAfter}
                  onChange={(e) => setRecallDueAfter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Recall due on/before</label>
                <input
                  type="date"
                  value={recallDueBefore}
                  onChange={(e) => setRecallDueBefore(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-slate-500">Appointment type</label>
                <input
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value)}
                  placeholder="e.g. Eye Exam (leave blank for any)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
              <Users className="h-4 w-4 shrink-0" />
              {isPreviewLoading && !audiencePreview ? (
                <span>Estimating audience&hellip;</span>
              ) : (
                <span>
                  <strong>{audiencePreview?.count ?? 0}</strong> matching customer
                  {audiencePreview?.count === 1 ? "" : "s"} (opted-out customers already excluded)
                </span>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || mutation.isPending}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Creating…" : "Create draft campaign"}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
