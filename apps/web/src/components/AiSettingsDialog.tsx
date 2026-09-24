import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { X, Plus, ShieldAlert } from "lucide-react";
import { fetchAiSettings, updateAiSettings, setAiKillSwitch } from "@/lib/aiSettings";
import { useAuth } from "@/lib/authContext";

interface AiSettingsDialogProps {
  onClose: () => void;
}

export function AiSettingsDialog({ onClose }: AiSettingsDialogProps) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canConfigure = hasPermission("ai:configure");
  const canKillSwitch = hasPermission("ai:kill_switch");

  const { data, isLoading } = useQuery({ queryKey: ["ai-settings"], queryFn: fetchAiSettings });

  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75);
  const [blocklistTerms, setBlocklistTerms] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed the editable fields from the fetched settings once they arrive.
  // Setting state during render (rather than in an effect) is the React-
  // documented way to adjust state from a prop/query change - it re-renders
  // before the browser paints, so there's no flash of the 0.75 default.
  const [seededAt, setSeededAt] = useState<string | null>(null);
  if (data && seededAt !== data.updatedAt) {
    setSeededAt(data.updatedAt);
    setConfidenceThreshold(Number(data.confidenceThreshold));
    setBlocklistTerms(data.blocklistTerms);
  }

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["ai-settings"] });
  }
  function onError(err: unknown) {
    if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
      setError(err.response.data.error.message);
    } else {
      setError("That change couldn't be saved. Please try again.");
    }
  }

  const saveMutation = useMutation({
    mutationFn: updateAiSettings,
    onSuccess: invalidate,
    onError,
  });
  const killSwitchMutation = useMutation({
    mutationFn: setAiKillSwitch,
    onSuccess: invalidate,
    onError,
  });

  function handleSave() {
    setError(null);
    saveMutation.mutate({ confidenceThreshold, blocklistTerms });
  }

  function addTerm() {
    const term = newTerm.trim();
    if (term && !blocklistTerms.includes(term)) {
      setBlocklistTerms((prev) => [...prev, term]);
    }
    setNewTerm("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">AI settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {isLoading && <p className="text-sm text-slate-400">Loading&hellip;</p>}

          {data && (
            <>
              {canKillSwitch && (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-viz-critical" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">AI auto-send</p>
                      <p className="text-xs text-slate-500">
                        Practice-wide kill switch - turning this off pauses every conversation's AI replies.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => killSwitchMutation.mutate(!data.autoSendEnabled)}
                    disabled={killSwitchMutation.isPending}
                    className={
                      data.autoSendEnabled
                        ? "shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        : "shrink-0 rounded-lg bg-viz-critical px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    }
                  >
                    {data.autoSendEnabled ? "Enabled - turn off" : "Disabled - turn on"}
                  </button>
                </div>
              )}

              {canConfigure && (
                <>
                  <div>
                    <label className="mb-1 flex items-center justify-between text-sm font-medium text-slate-700">
                      Confidence threshold
                      <span className="font-mono text-xs text-slate-500">{confidenceThreshold.toFixed(2)}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      Replies the AI is less confident than this are routed to the human queue instead of
                      auto-sent.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Blocklist terms</label>
                    <p className="mb-2 text-xs text-slate-400">
                      A customer message containing one of these routes straight to a staff member.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {blocklistTerms.map((term) => (
                        <span
                          key={term}
                          className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                        >
                          {term}
                          <button
                            onClick={() => setBlocklistTerms((prev) => prev.filter((t) => t !== term))}
                            className="text-slate-400 hover:text-slate-600"
                            aria-label={`Remove ${term}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newTerm}
                        onChange={(e) => setNewTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTerm();
                          }
                        }}
                        placeholder="Add a term&hellip;"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={addTerm}
                        type="button"
                        className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">Prompt version: {data.promptVersion}</p>
                </>
              )}

              {!canConfigure && !canKillSwitch && (
                <p className="text-sm text-slate-400">You don't have permission to view AI settings.</p>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {canConfigure && (
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
