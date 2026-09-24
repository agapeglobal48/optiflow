import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";
import { safeRate, estimateRevenue } from "./reportMath";

interface DateRange {
  from?: Date;
  to?: Date;
}

function createdAtRange(range: DateRange) {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  };
}

/**
 * Practice-wide KPI overview - the "how is revenue recovery going" snapshot
 * (build spec 5.9). Deliberately built from simple, independently-readable
 * counts rather than one complex aggregate query, so each number here is
 * easy to sanity-check against the other endpoints in this module (and
 * against a Postman click-through) while the dataset is dev/demo-sized.
 */
export async function getOverview(auth: AuthContext, range: DateRange = {}) {
  const createdAt = createdAtRange(range);

  const [
    customersTotal,
    customersOverdue,
    campaignsLaunched,
    messagesOutbound,
    messagesFromAi,
    messagesFromStaff,
    conversationsTotal,
    conversationsByStatus,
    bookingCounts,
    practice,
  ] = await Promise.all([
    prisma.customer.count({ where: withTenant(auth, { deletedAt: null }) }),
    prisma.customer.count({ where: withTenant(auth, { deletedAt: null, recallDueDate: { lte: new Date() } }) }),
    prisma.campaign.count({ where: withTenant(auth, { launchedAt: createdAt ? createdAt : { not: null } }) }),
    prisma.message.count({
      where: { conversation: { practiceId: auth.practiceId }, direction: "OUTBOUND", ...(createdAt ? { createdAt } : {}) },
    }),
    prisma.message.count({
      where: { conversation: { practiceId: auth.practiceId }, sender: "AI", ...(createdAt ? { createdAt } : {}) },
    }),
    prisma.message.count({
      where: { conversation: { practiceId: auth.practiceId }, sender: "STAFF", ...(createdAt ? { createdAt } : {}) },
    }),
    prisma.conversation.count({ where: withTenant(auth, createdAt ? { createdAt } : {}) }),
    prisma.conversation.groupBy({
      by: ["status"],
      where: withTenant(auth, createdAt ? { createdAt } : {}),
      _count: true,
    }) as unknown as Promise<Array<{ status: string; _count: number }>>,
    Promise.all(
      (["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const).map(async (status) => [
        status,
        await prisma.appointment.count({ where: withTenant(auth, { status, ...(createdAt ? { createdAt } : {}) }) }),
      ]),
    ),
    prisma.practice.findUniqueOrThrow({ where: { id: auth.practiceId }, select: { defaultAppointmentValue: true } }),
  ]);

  const bookingsByStatus = Object.fromEntries(bookingCounts) as Record<"BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW", number>;
  const bookingsTotal = bookingsByStatus.BOOKED + bookingsByStatus.COMPLETED + bookingsByStatus.CANCELLED + bookingsByStatus.NO_SHOW;
  const bookingsHonoured = bookingsByStatus.BOOKED + bookingsByStatus.COMPLETED; // not cancelled/no-show

  const appointmentValue = practice.defaultAppointmentValue ? Number(practice.defaultAppointmentValue) : null;

  return {
    range: { from: range.from ?? null, to: range.to ?? null },
    customers: {
      total: customersTotal,
      overdueForRecall: customersOverdue,
    },
    campaigns: {
      launched: campaignsLaunched,
    },
    messages: {
      outboundTotal: messagesOutbound,
      byAi: messagesFromAi,
      byStaff: messagesFromStaff,
      aiShare: safeRate(messagesFromAi, messagesOutbound),
    },
    conversations: {
      total: conversationsTotal,
      byStatus: Object.fromEntries(conversationsByStatus.map((c) => [c.status, c._count])),
    },
    bookings: {
      total: bookingsTotal,
      byStatus: bookingsByStatus,
      noShowRate: safeRate(bookingsByStatus.NO_SHOW, bookingsTotal),
    },
    revenue: {
      appointmentValue,
      estimatedRecovered: estimateRevenue(bookingsHonoured, appointmentValue),
    },
  };
}

interface CampaignPerformanceRow {
  campaignId: string;
  campaignName: string;
  status: string;
  launchedAt: Date | null;
  estimatedAudienceSize: number | null;
  suppressedCount: number | null;
  recipientsCount: number;
  sentCount: number;
  deliveredCount: number;
  repliedCount: number;
  bookedCount: number;
  replyRate: number | null;
  bookingRate: number | null; // booked / sent
  estimatedRevenue: number | null;
}

async function toPerformanceRow(
  campaign: {
    id: string;
    name: string;
    status: string;
    launchedAt: Date | null;
    estimatedAudienceSize: number | null;
    suppressedCount: number | null;
  },
  appointmentValue: number | null,
): Promise<CampaignPerformanceRow> {
  interface RecipientFunnelFields {
    sentAt: Date | null;
    deliveredAt: Date | null;
    repliedAt: Date | null;
    bookedAt: Date | null;
  }

  const recipients: RecipientFunnelFields[] = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id },
    select: { sentAt: true, deliveredAt: true, repliedAt: true, bookedAt: true },
  });

  const recipientsCount = recipients.length;
  const sentCount = recipients.filter((r: RecipientFunnelFields) => r.sentAt !== null).length;
  const deliveredCount = recipients.filter((r: RecipientFunnelFields) => r.deliveredAt !== null).length;
  const repliedCount = recipients.filter((r: RecipientFunnelFields) => r.repliedAt !== null).length;
  const bookedCount = recipients.filter((r: RecipientFunnelFields) => r.bookedAt !== null).length;

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    status: campaign.status,
    launchedAt: campaign.launchedAt,
    estimatedAudienceSize: campaign.estimatedAudienceSize,
    suppressedCount: campaign.suppressedCount,
    recipientsCount,
    sentCount,
    deliveredCount,
    repliedCount,
    bookedCount,
    replyRate: safeRate(repliedCount, sentCount),
    bookingRate: safeRate(bookedCount, sentCount),
    estimatedRevenue: estimateRevenue(bookedCount, appointmentValue),
  };
}

export async function listCampaignPerformance(auth: AuthContext): Promise<CampaignPerformanceRow[]> {
  const practice = await prisma.practice.findUniqueOrThrow({ where: { id: auth.practiceId }, select: { defaultAppointmentValue: true } });
  const appointmentValue = practice.defaultAppointmentValue ? Number(practice.defaultAppointmentValue) : null;

  interface CampaignSummaryFields {
    id: string;
    name: string;
    status: string;
    launchedAt: Date | null;
    estimatedAudienceSize: number | null;
    suppressedCount: number | null;
  }

  const campaigns: CampaignSummaryFields[] = await prisma.campaign.findMany({
    where: withTenant(auth, {}),
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, launchedAt: true, estimatedAudienceSize: true, suppressedCount: true },
  });

  return Promise.all(campaigns.map((c: CampaignSummaryFields) => toPerformanceRow(c, appointmentValue)));
}

export async function getCampaignPerformance(auth: AuthContext, campaignId: string): Promise<CampaignPerformanceRow> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, practiceId: true, name: true, status: true, launchedAt: true, estimatedAudienceSize: true, suppressedCount: true },
  });
  if (!campaign) {
    const err = new Error("Campaign not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, campaign.practiceId);

  const practice = await prisma.practice.findUniqueOrThrow({ where: { id: auth.practiceId }, select: { defaultAppointmentValue: true } });
  const appointmentValue = practice.defaultAppointmentValue ? Number(practice.defaultAppointmentValue) : null;

  return toPerformanceRow(campaign, appointmentValue);
}

interface BookingsBreakdownFilters {
  branchId?: string;
  from?: Date;
  to?: Date;
}

export async function getBookingsBreakdown(auth: AuthContext, filters: BookingsBreakdownFilters = {}) {
  const createdAt = createdAtRange({ from: filters.from, to: filters.to });

  const branches: { id: string; name: string }[] = await prisma.branch.findMany({
    where: withTenant(auth, { deletedAt: null, ...(filters.branchId ? { id: filters.branchId } : {}) }),
    select: { id: true, name: true },
  });

  const byBranch = await Promise.all(
    branches.map(async (branch: { id: string; name: string }) => {
      const counts = await Promise.all(
        (["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const).map(async (status) => [
          status,
          await prisma.appointment.count({
            where: { branchId: branch.id, status, ...(createdAt ? { createdAt } : {}) },
          }),
        ]),
      );
      return { branchId: branch.id, branchName: branch.name, byStatus: Object.fromEntries(counts) };
    }),
  );

  return { branches: byBranch };
}
