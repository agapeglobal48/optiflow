// Mirrors apps/api Branch (subset)/Appointment models and the bookings
// route responses (apps/api/src/modules/bookings/*, branches/*).

export type AppointmentStatus = "BOOKED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export interface Branch {
  id: string;
  practiceId: string;
  name: string;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  workingHours: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Slot {
  startTime: string;
  endTime: string;
}

export interface Appointment {
  id: string;
  practiceId: string;
  branchId: string;
  branch: { name: string };
  customerId: string;
  customer: { firstName: string; lastName: string | null; mobile: string | null };
  appointmentType: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  source: string;
  externalRef: string | null;
  campaignId: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}
