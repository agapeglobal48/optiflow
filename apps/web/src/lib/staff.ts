import { api } from "./api";
import type { Role, StaffUser, StaffInvite } from "@/types/settings";

export async function fetchRoles(): Promise<Role[]> {
  return (await api.get<Role[]>("/staff/roles")).data;
}

export async function fetchStaffUsers(): Promise<StaffUser[]> {
  return (await api.get<StaffUser[]>("/staff/users")).data;
}

export interface UpdateStaffUserInput {
  roleId?: string;
  isActive?: boolean;
}

export async function updateStaffUser(id: string, input: UpdateStaffUserInput): Promise<StaffUser> {
  return (await api.patch<StaffUser>(`/staff/users/${id}`, input)).data;
}

export async function fetchInvites(): Promise<StaffInvite[]> {
  return (await api.get<StaffInvite[]>("/staff/invites")).data;
}

export interface CreateInviteInput {
  email: string;
  roleId: string;
}

export interface CreateInviteResult {
  inviteId: string;
  rawToken: string;
  expiresAt: string;
}

export async function createStaffInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
  return (await api.post<CreateInviteResult>("/staff/invites", input)).data;
}

export async function revokeStaffInvite(id: string): Promise<void> {
  await api.delete(`/staff/invites/${id}`);
}
