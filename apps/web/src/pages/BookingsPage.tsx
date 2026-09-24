import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Plus, Clock, CheckCircle2, XCircle, Ban } from "lucide-react";
import { fetchBranches } from "@/lib/branches";
import { fetchAvailability, fetchBookings, cancelBooking, updateBookingStatus } from "@/lib/bookings";
import { useAuth } from "@/lib/authContext";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { NewBookingDialog } from "@/components/NewBookingDialog";
import type { AppointmentStatus, Slot } from "@/types/booking";

const STATUS_TONE: Record<AppointmentStatus, "default" | "good" | "warning" | "critical"> = {
  BOOKED: "default",
  COMPLETED: "good",
  CANCELLED: "critical",
  NO_SHOW: "warning",
};

const STATUS_FILTERS: { value: AppointmentStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "BOOKED", label: "Booked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No-show" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function slotLabel(slot: Slot): string {
  return new Date(slot.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function BookingsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [dialogSlot, setDialogSlot] = useState<Slot | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canCreate = hasPermission("bookings:create");
  const canCancel = hasPermission("bookings:cancel");

  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const branches = branchesQuery.data ?? [];
  const effectiveBranchId = branchId || branches[0]?.id || "";

  const availabilityQuery = useQuery({
    queryKey: ["availability", effectiveBranchId, date],
    queryFn: () => fetchAvailability({ branchId: effectiveBranchId, date, days: 1 }),
    enabled: !!effectiveBranchId,
  });

  const bookingsQuery = useQuery({
    queryKey: ["bookings", "list", effectiveBranchId, statusFilter || null],
    queryFn: () =>
      fetchBookings({ branchId: effectiveBranchId || undefined, status: statusFilter || undefined }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["availability"] });
    void queryClient.invalidateQueries({ queryKey: ["reports", "overview"] });
  }
  function onActionError(err: unknown) {
    if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
      setActionError(err.response.data.error.message);
    } else {
      setActionError("That action failed. Please try again.");
    }
  }

  const cancelMutation = useMutation({ mutationFn: cancelBooking, onSuccess: invalidate, onError: onActionError });
  const statusMutation = useMutation({
    mutationFn: (args: { id: string; status: "COMPLETED" | "NO_SHOW" }) => updateBookingStatus(args.id, args.status),
    onSuccess: invalidate,
    onError: onActionError,
  });

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bookings</h1>
          <p className="mt-1 text-sm text-slate-500">Appointment availability and confirmed bookings.</p>
        </div>
        {canCreate && branches.length > 0 && (
          <button
            onClick={() => {
              setDialogSlot(null);
              setDialogOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            New booking
          </button>
        )}
      </div>

      {branchesQuery.data && branches.length === 0 && (
        <p className="mt-6 text-sm text-slate-400">No branches set up yet - add one in Settings first.</p>
      )}

      {branches.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Branch</label>
              <select
                value={effectiveBranchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
              <input
                type="date"
                value={date}
                min={todayIso()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-slate-500">Available slots</h2>
            {availabilityQuery.isLoading && <p className="mt-3 text-sm text-slate-400">Loading&hellip;</p>}
            {availabilityQuery.data?.length === 0 && (
              <p className="mt-3 text-sm text-slate-400">No open slots this day.</p>
            )}
            {availabilityQuery.data && availabilityQuery.data.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {availabilityQuery.data.map((s) => (
                  <button
                    key={s.startTime}
                    disabled={!canCreate}
                    onClick={() => {
                      setDialogSlot(s);
                      setDialogOpen(true);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Clock className="h-3 w-3" />
                    {slotLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Bookings</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {bookingsQuery.isLoading && <p className="p-6 text-sm text-slate-400">Loading bookings&hellip;</p>}
        {bookingsQuery.isError && <p className="p-6 text-sm text-red-600">Could not load bookings.</p>}
        {bookingsQuery.data?.length === 0 && <p className="p-6 text-sm text-slate-400">No bookings here.</p>}
        {bookingsQuery.data && bookingsQuery.data.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canCancel && <th className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {bookingsQuery.data.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {[b.customer.firstName, b.customer.lastName].filter(Boolean).join(" ")}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{b.appointmentType}</td>
                  <td className="px-4 py-3 text-slate-600">{b.branch.name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(b.startTime)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[b.status]}>{b.status.replace("_", "-")}</Badge>
                  </td>
                  {canCancel && (
                    <td className="px-4 py-3">
                      {b.status === "BOOKED" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })}
                            disabled={statusMutation.isPending || cancelMutation.isPending}
                            className="flex items-center gap-1 text-xs font-medium text-viz-good hover:underline disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Completed
                          </button>
                          <button
                            onClick={() => statusMutation.mutate({ id: b.id, status: "NO_SHOW" })}
                            disabled={statusMutation.isPending || cancelMutation.isPending}
                            className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            No-show
                          </button>
                          <button
                            onClick={() => cancelMutation.mutate(b.id)}
                            disabled={statusMutation.isPending || cancelMutation.isPending}
                            className="flex items-center gap-1 text-xs font-medium text-viz-critical hover:underline disabled:opacity-50"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialogOpen && (
        <NewBookingDialog
          branches={branches}
          initialBranchId={effectiveBranchId || undefined}
          initialSlot={dialogSlot ?? undefined}
          onClose={() => setDialogOpen(false)}
          onCreated={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
