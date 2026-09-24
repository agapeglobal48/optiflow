// STUB - not a real integration.
//
// Build spec mentions syncing bookings out to a practice's own calendar
// system (Google Calendar / Outlook) eventually. Given this phase's scope,
// this file exists only to give that idea a concrete seam in the codebase -
// Appointment.source/externalRef already exist in the schema for this
// purpose - without pretending it's implemented.
//
// Wiring a real provider here later means: implement ExternalCalendarProvider
// for the target API (OAuth flow, event create/update/delete), swap the
// Noop implementation in getExternalCalendarProvider(), and call
// syncBooking()/removeBooking() from bookingService at the points marked
// with a "external calendar sync (stub)" comment.

export interface ExternalCalendarSyncResult {
  externalRef: string;
}

export interface ExternalCalendarProvider {
  syncBooking(appointment: {
    id: string;
    branchId: string;
    startTime: Date;
    endTime: Date;
    appointmentType: string;
  }): Promise<ExternalCalendarSyncResult | null>;

  removeBooking(externalRef: string): Promise<void>;
}

class NoopExternalCalendarProvider implements ExternalCalendarProvider {
  async syncBooking(): Promise<ExternalCalendarSyncResult | null> {
    // Intentionally a no-op: no external calendar is connected. Returning
    // null means Appointment.externalRef stays null and source stays
    // "internal" - callers must not assume a sync happened.
    return null;
  }

  async removeBooking(): Promise<void> {
    // no-op
  }
}

export function getExternalCalendarProvider(): ExternalCalendarProvider {
  return new NoopExternalCalendarProvider();
}
