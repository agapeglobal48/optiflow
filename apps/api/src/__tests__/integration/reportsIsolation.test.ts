// INTEGRATION TEST - requires a real database.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { getOverview, listCampaignPerformance, getCampaignPerformance, getBookingsBreakdown } from "../../modules/reports/reportsService";
import { createBooking } from "../../modules/bookings/bookingService";
import { AuthContext } from "../../types/express";
import { campaignSendQueue } from "../../lib/queue";

function nextMonday10am(): Date {
  const d = new Date();
  const day = d.getUTCDay();
  const daysUntilMonday = ((1 - day + 7) % 7) || 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 10, 0, 0));
}

describe("reports", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let authB: AuthContext;
  let branchA: { id: string };
  let customerA: { id: string };

  beforeEach(async () => {
    practiceA = await prisma.practice.create({ data: { name: "Reports Test Practice A", defaultAppointmentValue: 100 } });
    practiceB = await prisma.practice.create({ data: { name: "Reports Test Practice B" } }); // no appointmentValue set
    authA = { userId: "staff-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };
    authB = { userId: "staff-user-b", practiceId: practiceB.id, roleId: "n/a", permissions: [] };

    branchA = await prisma.branch.create({
      data: {
        practiceId: practiceA.id,
        name: "Main Branch A",
        workingHours: {
          mon: [{ open: "09:00", close: "17:00" }],
          tue: [{ open: "09:00", close: "17:00" }],
          wed: [{ open: "09:00", close: "17:00" }],
          thu: [{ open: "09:00", close: "17:00" }],
          fri: [{ open: "09:00", close: "17:00" }],
          sat: [],
          sun: [],
        },
      },
    });
    customerA = await prisma.customer.create({
      data: { practiceId: practiceA.id, firstName: "Priya", mobile: "447700900321" },
    });
  });

  afterAll(async () => {
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  it("overview counts bookings and estimates revenue using the practice's appointment value", async () => {
    await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
    });

    const overview = await getOverview(authA);
    expect(overview.bookings.byStatus.BOOKED).toBe(1);
    expect(overview.bookings.total).toBe(1);
    expect(overview.revenue.appointmentValue).toBe(100);
    expect(overview.revenue.estimatedRecovered).toBe(100); // 1 booking * 100
  });

  it("overview reports null estimated revenue when the practice hasn't configured an appointment value", async () => {
    const overview = await getOverview(authB);
    expect(overview.revenue.appointmentValue).toBeNull();
    expect(overview.revenue.estimatedRecovered).toBeNull();
  });

  it("does not let practice B see practice A's overview numbers", async () => {
    await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
    });

    const overviewB = await getOverview(authB);
    expect(overviewB.bookings.total).toBe(0);
    expect(overviewB.customers.total).toBe(0);
  });

  it("campaign performance reflects the reply -> booked funnel and computes rates", async () => {
    const template = await prisma.messageTemplate.create({
      data: {
        practiceId: practiceA.id,
        name: "Recall Template",
        channel: "whatsapp",
        providerTemplateName: "recall_template",
        bodyPreview: "Hi {{firstName}}",
      },
    });
    const templateType = await prisma.campaignTemplateType.findFirstOrThrow({ where: { key: "eye_test_recall" } });
    const campaign = await prisma.campaign.create({
      data: { practiceId: practiceA.id, templateTypeId: templateType.id, messageTemplateId: template.id, name: "Recall", audienceFilter: {} },
    });
    // Two recipients: one sent+replied (will be booked), one just sent.
    await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        customerId: customerA.id,
        snapshotName: "Priya",
        snapshotChannel: "whatsapp",
        snapshotContact: "447700900321",
        status: "replied",
        sentAt: new Date(),
        repliedAt: new Date(),
      },
    });
    const secondCustomer = await prisma.customer.create({ data: { practiceId: practiceA.id, firstName: "Sam", mobile: "447700900322" } });
    await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        customerId: secondCustomer.id,
        snapshotName: "Sam",
        snapshotChannel: "whatsapp",
        snapshotContact: "447700900322",
        status: "sent",
        sentAt: new Date(),
      },
    });

    await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
      campaignId: campaign.id,
    });

    const row = await getCampaignPerformance(authA, campaign.id);
    expect(row.recipientsCount).toBe(2);
    expect(row.sentCount).toBe(2);
    expect(row.repliedCount).toBe(1);
    expect(row.bookedCount).toBe(1);
    expect(row.replyRate).toBeCloseTo(0.5);
    expect(row.bookingRate).toBeCloseTo(0.5);
    expect(row.estimatedRevenue).toBe(100);

    const list = await listCampaignPerformance(authA);
    expect(list.map((r) => r.campaignId)).toContain(campaign.id);
  });

  it("does not let practice B fetch practice A's campaign performance", async () => {
    const template = await prisma.messageTemplate.create({
      data: { practiceId: practiceA.id, name: "T", channel: "whatsapp", providerTemplateName: "t", bodyPreview: "Hi" },
    });
    const templateType = await prisma.campaignTemplateType.findFirstOrThrow({ where: { key: "eye_test_recall" } });
    const campaign = await prisma.campaign.create({
      data: { practiceId: practiceA.id, templateTypeId: templateType.id, messageTemplateId: template.id, name: "A's Campaign", audienceFilter: {} },
    });

    await expect(getCampaignPerformance(authB, campaign.id)).rejects.toThrow("Resource not found");
  });

  it("bookings breakdown groups counts by branch and status, scoped to the tenant", async () => {
    await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
    });

    const breakdown = await getBookingsBreakdown(authA);
    expect(breakdown.branches).toHaveLength(1);
    expect(breakdown.branches[0].branchId).toBe(branchA.id);
    expect(breakdown.branches[0].byStatus.BOOKED).toBe(1);

    const breakdownB = await getBookingsBreakdown(authB);
    expect(breakdownB.branches).toHaveLength(0);
  });
});
