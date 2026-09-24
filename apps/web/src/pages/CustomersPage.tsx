import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Search, Upload, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { fetchCustomers, deleteCustomer } from "@/lib/customers";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useAuth } from "@/lib/authContext";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { ImportCsvDialog } from "@/components/ImportCsvDialog";
import { CustomerDialog } from "@/components/CustomerDialog";
import type { Customer } from "@/types/customer";

const PAGE_SIZE = 25;

function isOverdue(recallDueDate: string | null): boolean {
  return recallDueDate !== null && new Date(recallDueDate).getTime() <= Date.now();
}

function customerName(c: Customer): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export function CustomersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [dialogCustomer, setDialogCustomer] = useState<Customer | null | undefined>(undefined);
  const debouncedSearch = useDebouncedValue(search, 300);

  const canEdit = hasPermission("customers:edit");

  const { data, isLoading, isError, isPlaceholderData } = useQuery({
    queryKey: ["customers", "list", { page, search: debouncedSearch }],
    queryFn: () => fetchCustomers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["reports", "overview"] });
    },
  });

  function handleDelete(customer: Customer) {
    if (window.confirm(`Remove ${customerName(customer)}? This can't be undone from here.`)) {
      deleteMutation.mutate(customer.id);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.total.toLocaleString()} total` : "Patient recall records"}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <button
              onClick={() => setDialogCustomer(null)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Add customer
            </button>
          )}
          {hasPermission("customers:import") && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 sm:max-w-sm">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, email, or mobile"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading && <p className="p-6 text-sm text-slate-400">Loading customers&hellip;</p>}
        {isError && <p className="p-6 text-sm text-red-600">Could not load customers - is the API running?</p>}

        {data && data.customers.length === 0 && (
          <p className="p-6 text-sm text-slate-400">
            {debouncedSearch ? "No customers match that search." : "No customers yet - import a CSV to get started."}
          </p>
        )}

        {data && data.customers.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Recall due</th>
                <th className="px-4 py-3 font-medium">What they want</th>
                <th className="px-4 py-3 font-medium">Consent</th>
                {canEdit && <th className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className={isPlaceholderData ? "opacity-60" : undefined}>
              {data.customers.map((customer) => {
                const overdue = isOverdue(customer.recallDueDate);
                return (
                  <tr key={customer.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{customerName(customer)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{customer.mobile ?? "—"}</div>
                      {customer.email && <div className="text-xs text-slate-400">{customer.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={overdue ? "flex items-center gap-1.5 font-medium text-viz-critical" : "text-slate-600"}>
                        {overdue && <Clock className="h-3.5 w-3.5" aria-hidden />}
                        {formatDate(customer.recallDueDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{customer.appointmentType ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          customer.consentStatus === "OPTED_OUT"
                            ? "critical"
                            : customer.consentStatus === "OPTED_IN"
                              ? "good"
                              : "default"
                        }
                      >
                        {customer.consentStatus === "OPTED_IN"
                          ? "Opted in"
                          : customer.consentStatus === "OPTED_OUT"
                            ? "Opted out"
                            : "Unknown"}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDialogCustomer(customer)}
                            className="text-slate-400 hover:text-indigo-600"
                            aria-label={`Edit ${customerName(customer)}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer)}
                            className="text-slate-400 hover:text-viz-critical"
                            aria-label={`Remove ${customerName(customer)}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {importOpen && <ImportCsvDialog onClose={() => setImportOpen(false)} />}

      {dialogCustomer !== undefined && (
        <CustomerDialog
          customer={dialogCustomer}
          onClose={() => setDialogCustomer(undefined)}
          onSaved={() => setDialogCustomer(undefined)}
        />
      )}
    </div>
  );
}
