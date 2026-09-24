import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, Clock, MapPin, Phone, Mail, UserPlus, X } from "lucide-react";
import { fetchBranches, deleteBranch } from "@/lib/branches";
import { fetchStaffUsers, fetchInvites, updateStaffUser, revokeStaffInvite, fetchRoles } from "@/lib/staff";
import { fetchKnowledgeEntries, deleteKnowledgeEntry } from "@/lib/knowledgeBase";
import { useAuth } from "@/lib/authContext";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { BranchDialog } from "@/components/BranchDialog";
import { InviteStaffDialog } from "@/components/InviteStaffDialog";
import { KnowledgeEntryDialog } from "@/components/KnowledgeEntryDialog";
import type { Branch } from "@/types/booking";
import type { KnowledgeEntry } from "@/types/settings";

type Tab = "branches" | "staff" | "knowledge";

export function SettingsPage() {
  const { hasPermission } = useAuth();

  const canViewBranches = hasPermission("branches:view");
  const canManageStaff = hasPermission("staff:invite") || hasPermission("staff:manage_roles");
  const canViewKnowledge = hasPermission("ai:configure");

  const tabs: { id: Tab; label: string }[] = [
    ...(canViewBranches ? [{ id: "branches" as const, label: "Branches" }] : []),
    ...(canManageStaff ? [{ id: "staff" as const, label: "Staff & roles" }] : []),
    ...(canViewKnowledge ? [{ id: "knowledge" as const, label: "Knowledge base" }] : []),
  ];

  const [activeTab, setActiveTab] = useState<Tab | null>(tabs[0]?.id ?? null);
  const tab = activeTab && tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id ?? null;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Branches, staff access, and the AI&apos;s knowledge base.</p>

      {tabs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">You don&apos;t have access to any settings sections.</p>
      ) : (
        <>
          <div className="mt-6 flex gap-1 border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={clsx(
                  "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "branches" && <BranchesPanel canManage={hasPermission("branches:manage")} />}
            {tab === "staff" && (
              <StaffPanel canInvite={hasPermission("staff:invite")} canManageRoles={hasPermission("staff:manage_roles")} />
            )}
            {tab === "knowledge" && <KnowledgeBasePanel />}
          </div>
        </>
      )}
    </div>
  );
}

function BranchesPanel({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [dialogBranch, setDialogBranch] = useState<Branch | null | undefined>(undefined);

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const deleteMutation = useMutation({
    mutationFn: deleteBranch,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["branches"] }),
  });

  function handleDelete(branch: Branch) {
    if (window.confirm(`Remove ${branch.name}? This can't be undone from here.`)) {
      deleteMutation.mutate(branch.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Branch locations</h2>
        {canManage && (
          <button
            onClick={() => setDialogBranch(null)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New branch
          </button>
        )}
      </div>

      {branchesQuery.isLoading && <p className="mt-4 text-sm text-slate-400">Loading branches&hellip;</p>}
      {branchesQuery.data?.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">No branches yet. Add your first one to start taking bookings.</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {branchesQuery.data?.map((b) => (
          <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <h3 className="font-medium text-slate-900">{b.name}</h3>
              {canManage && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setDialogBranch(b)}
                    className="text-slate-400 hover:text-indigo-600"
                    aria-label={`Edit ${b.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b)}
                    className="text-slate-400 hover:text-viz-critical"
                    aria-label={`Remove ${b.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-500">
              {b.address && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {b.address}
                </p>
              )}
              {b.contactPhone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {b.contactPhone}
                </p>
              )}
              {b.contactEmail && (
                <p className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {b.contactEmail}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {hasAnyHours(b.workingHours) ? "Hours configured" : "No hours configured"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {dialogBranch !== undefined && (
        <BranchDialog branch={dialogBranch} onClose={() => setDialogBranch(undefined)} onSaved={() => setDialogBranch(undefined)} />
      )}
    </div>
  );
}

function hasAnyHours(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Object.values(raw as Record<string, unknown>).some((v) => Array.isArray(v) && v.length > 0);
}

function StaffPanel({ canInvite, canManageRoles }: { canInvite: boolean; canManageRoles: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const usersQuery = useQuery({ queryKey: ["staff", "users"], queryFn: fetchStaffUsers });
  const invitesQuery = useQuery({ queryKey: ["staff", "invites"], queryFn: fetchInvites });
  const rolesQuery = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });
  const roles = rolesQuery.data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) => updateStaffUser(id, { roleId }),
    onMutate: ({ id }) => setSavingUserId(id),
    onSettled: () => {
      setSavingUserId(null);
      void queryClient.invalidateQueries({ queryKey: ["staff", "users"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateStaffUser(id, { isActive }),
    onMutate: ({ id }) => setSavingUserId(id),
    onSettled: () => {
      setSavingUserId(null);
      void queryClient.invalidateQueries({ queryKey: ["staff", "users"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeStaffInvite,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["staff", "invites"] }),
  });

  const pendingInvites = invitesQuery.data?.filter((i) => !i.acceptedAt) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Staff</h2>
          {canInvite && (
            <button
              onClick={() => setInviteOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <UserPlus className="h-4 w-4" />
              Invite staff
            </button>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {usersQuery.isLoading && <p className="p-6 text-sm text-slate-400">Loading staff&hellip;</p>}
          {usersQuery.data && usersQuery.data.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canManageRoles && <th className="px-4 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.firstName} {u.lastName}
                      {u.id === user?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {canManageRoles ? (
                        <select
                          value={u.role.id}
                          disabled={savingUserId === u.id}
                          onChange={(e) => updateMutation.mutate({ id: u.id, roleId: e.target.value })}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.role.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.isActive ? "good" : "default"}>{u.isActive ? "Active" : "Disabled"}</Badge>
                    </td>
                    {canManageRoles && (
                      <td className="px-4 py-3">
                        {u.id !== user?.id && (
                          <button
                            onClick={() => toggleActiveMutation.mutate({ id: u.id, isActive: !u.isActive })}
                            disabled={savingUserId === u.id}
                            className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50"
                          >
                            {u.isActive ? "Disable" : "Re-enable"}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {canInvite && (
        <div>
          <h2 className="text-sm font-medium text-slate-700">Pending invites</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {invitesQuery.isLoading && <p className="p-6 text-sm text-slate-400">Loading invites&hellip;</p>}
            {pendingInvites.length === 0 && !invitesQuery.isLoading && (
              <p className="p-6 text-sm text-slate-400">No pending invites.</p>
            )}
            {pendingInvites.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Sent</th>
                    <th className="px-4 py-3 font-medium">Expires</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((i) => (
                    <tr key={i.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{i.email}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(i.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(i.expiresAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => revokeMutation.mutate(i.id)}
                          disabled={revokeMutation.isPending}
                          className="flex items-center gap-1 text-xs font-medium text-viz-critical hover:underline disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {inviteOpen && <InviteStaffDialog onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function KnowledgeBasePanel() {
  const queryClient = useQueryClient();
  const [dialogEntry, setDialogEntry] = useState<KnowledgeEntry | null | undefined>(undefined);

  const entriesQuery = useQuery({ queryKey: ["knowledge-base"], queryFn: fetchKnowledgeEntries });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeEntry,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["knowledge-base"] }),
  });

  function handleDelete(entry: KnowledgeEntry) {
    if (window.confirm(`Delete the "${entry.topic}" entry?`)) {
      deleteMutation.mutate(entry.id);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-700">Knowledge base</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Extra facts the AI can draw on when answering customers outside its default conversation flow.
          </p>
        </div>
        <button
          onClick={() => setDialogEntry(null)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New entry
        </button>
      </div>

      {entriesQuery.isLoading && <p className="mt-4 text-sm text-slate-400">Loading entries&hellip;</p>}
      {entriesQuery.data?.length === 0 && (
        <p className="mt-4 text-sm text-slate-400">No knowledge base entries yet.</p>
      )}

      <div className="mt-4 space-y-3">
        {entriesQuery.data?.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-slate-900">{entry.topic}</h3>
                {entry.question && <p className="mt-0.5 text-xs italic text-slate-400">&ldquo;{entry.question}&rdquo;</p>}
                <p className="mt-1.5 text-sm text-slate-600">{entry.answer}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setDialogEntry(entry)}
                  className="text-slate-400 hover:text-indigo-600"
                  aria-label={`Edit ${entry.topic}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(entry)}
                  className="text-slate-400 hover:text-viz-critical"
                  aria-label={`Delete ${entry.topic}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {dialogEntry !== undefined && (
        <KnowledgeEntryDialog entry={dialogEntry} onClose={() => setDialogEntry(undefined)} onSaved={() => setDialogEntry(undefined)} />
      )}
    </div>
  );
}
