import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { createMessageTemplate } from "@/lib/campaigns";
import type { MessageTemplate } from "@/types/campaign";

interface NewTemplateFormProps {
  onCreated: (template: MessageTemplate) => void;
  onCancel: () => void;
}

// Inline form for creating a WhatsApp message template, used both from the
// campaign builder (so picking a template and making a new one is one
// flow) and from the standalone Templates tab.
export function NewTemplateForm({ onCreated, onCancel }: NewTemplateFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [providerTemplateName, setProviderTemplateName] = useState("");
  const [bodyPreview, setBodyPreview] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createMessageTemplate,
    onSuccess: (template) => {
      void queryClient.invalidateQueries({ queryKey: ["message-templates"] });
      onCreated(template);
    },
    onError: (err) => {
      if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
        setError(err.response.data.error.message);
      } else {
        setError("Could not create the template. Please try again.");
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ name, channel: "whatsapp", providerTemplateName, bodyPreview });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Template name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Eye test recall - 6 month"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">WhatsApp/BSP template name</label>
        <input
          required
          value={providerTemplateName}
          onChange={(e) => setProviderTemplateName(e.target.value)}
          placeholder="eye_test_recall_v1"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-400">Must match the name registered with your WhatsApp provider.</p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Body preview</label>
        <textarea
          required
          rows={3}
          value={bodyPreview}
          onChange={(e) => setBodyPreview(e.target.value)}
          placeholder="Hi {{firstName}}, it's time for your eye test at {{practiceName}}..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "Saving…" : "Save template"}
        </button>
      </div>
    </form>
  );
}
