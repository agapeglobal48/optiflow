import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { X, Search, Clock } from "lucide-react";
import { fetchAvailability, createBooking } from "@/lib/bookings";
import { fetchCustomers } from "@/lib/customers";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { Branch, Slot } from "@/types/booking";
import type { Customer } from "@/types/customer";

interface NewBookingDialogProps {
  branches: Branch[];
  initialBranchId?: string;
  initialSlot?: Slot;
  onClose: () => void;
  onCreated: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function slotLabel(slot: Slot): string {
  return new Date(slot.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function customerName(c: Customer): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export function NewBookingDialog({ branches, initialBranchId, initialSlot, onClose, onCreated }: NewBookingDialogProps) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(initialBranchId ?? branches[0]?.id ?? "");
  const [date, setDate] = useState(initialSlot ? initialSlot.startTime.slice(0, 10) : todayIso());
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(initialSlot ?? null);
  const [appointmentType, setAppointmentType] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(customerSearch, 300);

  const { data: slots, isFetching: slotsLoading } = useQuery({
    queryKey: ["availability", branchId, date],
    queryFn: () => fetchAvailability({ branchId, date, days: 1 }),
    enabled: !!branchId && !!date,
  });

  const { data: customerResults } = useQuery({
    queryKey: ["customers", "search", debouncedSearch],
    queryFn: () => fetchCustomers({ search: debouncedSearch, pageSize: 5 }),
    enabled: debouncedSearch.trim().length > 0 && !selectedCustomer,
  });

  const mutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
      void queryClient.invalidateQueries({ queryKey: ["reports", "overview"] });
      onCreated();
    },
    onError: (err) => {
      if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
        setError(err.response.data.error.message);
      } else {
        setError("Could not create the booking. Please try again.");
      }
    },
  });

  const canSubmit = !!branchId && !!selectedCustomer && !!selectedSlot && appointmentType.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit || !selectedSlot || !selectedCustomer) return;
    mutation.mutate({
      branchId,
      customerId: selectedCustomer.id,
      appointmentType: appointmentType.trim(),
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">New booking</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Customer</label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <span>
                    {customerName(selectedCustomer)}
                    <span className="ml-2 text-xs text-slate-400">
                      {selectedCustomer.mobile ?? selectedCustomer.email}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerSearch("");
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by name, email, or mobile"
                      className="w-full text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                  {customerResults && customerResults.customers.length > 0 && (
                    <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200">
                      {customerResults.customers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span>{customerName(c)}</span>
                            <span className="text-xs text-slate-400">{c.mobile ?? c.email}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {debouncedSearch.trim() !== "" && customerResults?.customers.length === 0 && (
                    <p className="mt-1 text-xs text-slate-400">No customers match that search.</p>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Appointment type</label>
              <input
                required
                value={appointmentType}
                onChange={(e) => setAppointmentType(e.target.value)}
                placeholder="Eye Exam"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Branch</label>
                <select
                  value={branchId}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setSelectedSlot(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Date</label>
                <input
                  type="date"
                  value={date}
                  min={todayIso()}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Time</label>
              {slotsLoading && <p className="text-sm text-slate-400">Loading availability&hellip;</p>}
              {!slotsLoading && slots?.length === 0 && (
                <p className="text-sm text-slate-400">No open slots this day - try another date.</p>
              )}
              {!slotsLoading && slots && slots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.startTime}
                      type="button"
                      onClick={() => setSelectedSlot(s)}
                      className={
                        "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium " +
                        (selectedSlot?.startTime === s.startTime
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50")
                      }
                    >
                      <Clock className="h-3 w-3" />
                      {slotLabel(s)}
                    </button>
                  ))}
                </div>
              )}
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
              {mutation.isPending ? "Booking…" : "Confirm booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
