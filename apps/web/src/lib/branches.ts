import { api } from "./api";
import type { Branch } from "@/types/booking";
import type { WorkingHours } from "@/types/settings";

export async function fetchBranches(): Promise<Branch[]> {
  return (await api.get<Branch[]>("/branches")).data;
}

export interface BranchInput {
  name: string;
  address?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  workingHours?: WorkingHours;
}

export async function createBranch(input: BranchInput): Promise<Branch> {
  return (await api.post<Branch>("/branches", input)).data;
}

export async function updateBranch(id: string, input: Partial<BranchInput>): Promise<Branch> {
  return (await api.patch<Branch>(`/branches/${id}`, input)).data;
}

export async function deleteBranch(id: string): Promise<void> {
  await api.delete(`/branches/${id}`);
}
