import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { X, Upload, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { importCustomersCsv } from "@/lib/customers";
import type { ImportSummary } from "@/types/customer";

interface ImportCsvDialogProps {
  onClose: () => void;
}

export function ImportCsvDialog({ onClose }: ImportCsvDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: importCustomersCsv,
    onSuccess: (summary) => {
      setResult(summary);
      setServerError(null);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["reports", "overview"] });
    },
    onError: (err) => {
      if (err instanceof AxiosError && typeof err.response?.data?.error?.message === "string") {
        setServerError(err.response.data.error.message);
      } else {
        setServerError("Something went wrong uploading this file. Please try again.");
      }
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setServerError(null);
    setSelectedFile(e.target.files?.[0] ?? null);
  }

  function handleUpload() {
    if (selectedFile) mutation.mutate(selectedFile);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Import customers from CSV</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {!result && (
            <>
              <p className="text-sm text-slate-500">
                Columns are matched automatically (First Name, Mobile, Email, Recall Due Date, etc.). Every
                row needs a first name and at least a mobile number or email.
              </p>

              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-indigo-400">
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="mt-2 text-sm font-medium text-slate-700">
                  {selectedFile ? selectedFile.name : "Choose a CSV file"}
                </span>
                {!selectedFile && <span className="mt-1 text-xs text-slate-400">or drag and drop</span>}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {serverError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}
            </>
          )}

          {result && (
            <div>
              <div className="flex items-center gap-2 rounded-lg bg-viz-good/10 px-3 py-2 text-sm font-medium text-viz-good">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Import finished
              </div>

              <dl className="mt-4 grid grid-cols-4 gap-3 text-center">
                <div>
                  <dt className="text-xs text-slate-500">Rows</dt>
                  <dd className="text-lg font-semibold text-slate-900">{result.totalRows}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Imported</dt>
                  <dd className="text-lg font-semibold text-viz-good">{result.importedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Updated</dt>
                  <dd className="text-lg font-semibold text-viz-cat-1">{result.updatedCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Skipped</dt>
                  <dd className="text-lg font-semibold text-viz-critical">{result.skippedCount}</dd>
                </div>
              </dl>

              {(result.errors.length > 0 || result.warnings.length > 0) && (
                <div className="mt-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-3">
                  {result.errors.map((e, i) => (
                    <p key={`err-${i}`} className="text-xs text-viz-critical">
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                  {result.warnings.map((w, i) => (
                    <p key={`warn-${i}`} className="text-xs text-amber-700">
                      Row {w.row}: {w.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || mutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mutation.isPending ? "Uploading…" : "Upload"}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
