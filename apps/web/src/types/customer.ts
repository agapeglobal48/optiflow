// Mirrors apps/api Customer model + list/import response shapes
// (apps/api/src/modules/customers/*).

export type ConsentStatus = "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";

export interface Customer {
  id: string;
  practiceId: string;
  branchId: string | null;
  externalId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  preferredChannel: string | null;
  recallDueDate: string | null;
  appointmentType: string | null;
  consentStatus: ConsentStatus;
  importSource: string | null;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListCustomersResponse {
  total: number;
  page: number;
  pageSize: number;
  customers: Customer[];
}

export interface RowIssue {
  row: number;
  message: string;
}

export interface ImportSummary {
  batchId: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: RowIssue[];
  warnings: RowIssue[];
}

export interface ImportBatch {
  id: string;
  filename: string;
  status: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: RowIssue[];
  warnings: RowIssue[];
  createdAt: string;
  completedAt: string | null;
}
