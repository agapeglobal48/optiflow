import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { X, Copy, Check } from "lucide-react";
import { fetchRoles, createStaffInvite, type CreateInviteResult } from "@/lib/staff";

interface InviteStaffDialogProps {
  onClose: () => void;
}

export function InviteStaffDialog({ onClose }: InviteStaffDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateInviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });
  const roles = rolesQuery.data ?? [];
  const effectiveRoleId = roleId || roles[0]?.id || "";

  const mutation = useMutation({
    mutationFn: () => createStaffInvite({ email: email.trim(), roleId: effectiveRoleId }),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (err) => {
      if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
        setError(err.response.data.error.message);
      } else {
        setError("Could not create the invite. Please try again.");
      }
    },
  });

  const inviteLink = result ? `${window.location.origin}/accept-invite/${result.rawToken}` : "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !effectiveRoleId) return;
    mutation.mutate();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access can be denied by the browser - link is still selectable text
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex w-full max-w-md flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Invite staff member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4 px-5 py-4">
            <p className="text-sm text-slate-600">
              Invite created for <span className="font-medium text-slate-900">{email}</span>. Email delivery isn&apos;t
              wired up yet, so share this link with them directly:
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
              <span className="flex-1 truncate text-xs text-slate-600">{inviteLink}</span>
              <button
                type="button"
                onClick={() => void copyLink()}
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-slate-400">Expires {new Date(result.expiresAt).toLocaleString("en-US")}</p>
            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@practice.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
              <select
                value={effectiveRoleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {rolesQuery.data && roles.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">No roles available for this practice yet.</p>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!email.trim() || !effectiveRoleId || mutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending ? "Sending…" : "Create invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
