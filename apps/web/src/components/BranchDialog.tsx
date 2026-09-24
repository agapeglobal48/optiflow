import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { X, Plus, Trash2 } from "lucide-react";
import { createBranch, updateBranch } from "@/lib/branches";
import { DAY_KEYS, DAY_LABELS, parseWorkingHoursForEditor, serializeWorkingHours } from "@/lib/workingHours";
import type { Branch } from "@/types/booking";
import type { DayKey, TimeRange } from "@/types/settings";

interface BranchDialogProps {
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}

export function BranchDialog({ branch, onClose, onSaved }: BranchDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [contactPhone, setContactPhone] = useState(branch?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(branch?.contactEmail ?? "");
  const [hours, setHours] = useState<Record<DayKey, TimeRange[]>>(() => parseWorkingHoursForEditor(branch?.workingHours));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        name: name.trim(),
        address: address.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        workingHours: serializeWorkingHours(hours),
      };
      return branch ? updateBranch(branch.id, input) : createBranch(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
      onSaved();
    },
    onError: (err) => {
      if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
        setError(err.response.data.error.message);
      } else {
        setError("Could not save the branch. Please try again.");
      }
    },
  });

  function addRange(day: DayKey) {
    setHours((prev) => ({ ...prev, [day]: [...prev[day], { open: "09:00", close: "17:00" }] }));
  }

  function removeRange(day: DayKey, index: number) {
    setHours((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== index) }));
  }

  function updateRange(day: DayKey, index: number, field: "open" | "close", value: string) {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day].map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{branch ? "Edit branch" : "New branch"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main Branch"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact phone</label>
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Contact email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Working hours</label>
              <p className="mb-2 text-xs text-slate-400">Times are 24h and treated as UTC.</p>
              <div className="space-y-2">
                {DAY_KEYS.map((day) => (
                  <div key={day} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{DAY_LABELS[day]}</span>
                      <button
                        type="button"
                        onClick={() => addRange(day)}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add hours
                      </button>
                    </div>
                    {hours[day].length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">Closed</p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {hours[day].map((range, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={range.open}
                              onChange={(e) => updateRange(day, index, "open", e.target.value)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                            <span className="text-xs text-slate-400">to</span>
                            <input
                              type="time"
                              value={range.close}
                              onChange={(e) => updateRange(day, index, "close", e.target.value)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => removeRange(day, index)}
                              className="ml-auto text-slate-400 hover:text-viz-critical"
                              aria-label="Remove range"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
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
              disabled={!name.trim() || mutation.isPending}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Save branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
