// Mirrors apps/api's Role/User (subset) and KnowledgeEntry models, plus the
// staff invite + working-hours route responses (apps/api/src/modules/
// onboarding/*, rbac/*, knowledgeBase/*, bookings/workingHours.ts).

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  role: { id: string; name: string };
}

export interface StaffInvite {
  id: string;
  email: string;
  roleId: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface KnowledgeEntry {
  id: string;
  practiceId: string;
  topic: string;
  question: string | null;
  answer: string;
  createdAt: string;
  updatedAt: string;
}

// Working hours, per apps/api/src/modules/bookings/workingHours.ts. Times are
// "HH:mm" 24h strings, treated as UTC (no per-branch timezone support yet -
// same MVP limitation documented server-side).
export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface TimeRange {
  open: string;
  close: string;
}

export type WorkingHours = Partial<Record<DayKey, TimeRange[]>>;
