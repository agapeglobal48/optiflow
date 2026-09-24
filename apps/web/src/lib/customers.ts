import { api } from "./api";
import type { ConsentStatus, Customer, ImportBatch, ImportSummary, ListCustomersResponse } from "@/types/customer";

export interface ListCustomersParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export async function fetchCustomers(params: ListCustomersParams = {}): Promise<ListCustomersResponse> {
  const response = await api.get<ListCustomersResponse>("/customers", { params });
  return response.data;
}

export async function fetchCustomer(id: string): Promise<Customer> {
  const response = await api.get<Customer>(`/customers/${id}`);
  return response.data;
}

export async function importCustomersCsv(file: File): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<ImportSummary>("/customers/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function fetchImportBatches(): Promise<ImportBatch[]> {
  const response = await api.get<ImportBatch[]>("/customers/import/batches");
  return response.data;
}

export interface CustomerInput {
  branchId?: string | null;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  preferredChannel?: string | null;
  recallDueDate?: string | null;
  appointmentType?: string | null;
  consentStatus?: ConsentStatus;
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  return (await api.post<Customer>("/customers", input)).data;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
  return (await api.patch<Customer>(`/customers/${id}`, input)).data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}
