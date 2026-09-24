// Mirrors the response shape of GET /api/reports/overview
// (apps/api/src/modules/reports/reportsService.ts -> getOverview).

export type ConversationStatus =
  | "AI_HANDLING"
  | "WAITING_ON_CUSTOMER"
  | "HUMAN_QUEUE"
  | "HUMAN_HANDLING"
  | "BOOKED"
  | "CLOSED";

export interface BookingStatusCounts {
  BOOKED: number;
  COMPLETED: number;
  CANCELLED: number;
  NO_SHOW: number;
}

export interface OverviewReport {
  range: { from: string | null; to: string | null };
  customers: {
    total: number;
    overdueForRecall: number;
  };
  campaigns: {
    launched: number;
  };
  messages: {
    outboundTotal: number;
    byAi: number;
    byStaff: number;
    aiShare: number | null;
  };
  conversations: {
    total: number;
    byStatus: Partial<Record<ConversationStatus, number>>;
  };
  bookings: {
    total: number;
    byStatus: BookingStatusCounts;
    noShowRate: number | null;
  };
  revenue: {
    appointmentValue: number | null;
    estimatedRecovered: number | null;
  };
}
