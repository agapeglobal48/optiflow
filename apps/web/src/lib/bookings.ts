import { api } from "./api";
import type { Appointment, AppointmentStatus, Slot } from "@/types/booking";

export interface FetchAvailabilityParams {
  branchId: string;
  date?: string; // YYYY-MM-DD
  days?: number;
  slotMinutes?: number;
}

export async function fetchAvailability(params: FetchAvailabilityParams): Promise<Slot[]> {
  const { data } = await api.get<{ slots: Slot[] }>("/bookings/availability", { params });
  return data.slots;
}

export interface FetchBookingsParams {
  branchId?: string;
  customerId?: string;
  status?: AppointmentStatus;
  from?: string;
  to?: string;
}

export async function fetchBookings(params: FetchBookingsParams = {}): Promise<Appointment[]> {
  return (await api.get<Appointment[]>("/bookings", { params })).data;
}

export interface CreateBookingInput {
  branchId: string;
  customerId: string;
  appointmentType: string;
  startTime: string;
  endTime?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Appointment> {
  return (await api.post<Appointment>("/bookings", input)).data;
}

export async function cancelBooking(id: string): Promise<Appointment> {
  return (await api.patch<Appointment>(`/bookings/${id}/cancel`)).data;
}

export async function updateBookingStatus(id: string, status: "COMPLETED" | "NO_SHOW"): Promise<Appointment> {
  return (await api.patch<Appointment>(`/bookings/${id}/status`, { status })).data;
}
