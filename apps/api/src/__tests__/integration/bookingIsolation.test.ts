// INTEGRATION TEST - requires a real database (WHATSAPP_PROVIDER should
// be "mock", the default). Covers tenant isolation (spec 14) and the
// double-booking prevention that's the whole point of this module.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  updateBookingStatus,
} from "../../modules/bookings/bookingService";
import { getAvailability } from "../../modules/bookings/availabilityService";
import { AuthContext } from "../../types/express";
import { campaignSendQueue } from "../../lib/queue";

const WORKING_HOURS = {
  mon: [{ open: "09:00", close: "17:00" }],
  tue: [{ open: "09:00", close: "17:00" }],
  wed: [{ open: "09:00", close: "17:00" }],
  thu: [{ open: "09:00", close: "17:00" }],
  fri: [{ open: "09:00", close: "17:00" }],
  sat: [],
  sun: [],
};

// Picks the next Monday 10:00 UTC so tests are deterministic regardless of
// when they're run, and always land on a day the branch is open.
function nextMonday10am(): Date {
  const d = new Date();
  const day = d.getUTCDay(); // 0 = Sun
  const daysUntilMonday = ((1 - day + 7) % 7) || 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 10, 0, 0));
  return monday;
}

describe("bookings", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let authB: AuthContext;
  let branchA: { id: string };
  let customerA: { id: string };

  beforeEach(async () => {
    practiceA = await prisma.practice.create({ data: { name: "Booking Test Practice A" } });
    practiceB = await prisma.practice.create({ data: { name: "Booking Test Practice B" } });
    authA = { userId: "staff-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };
    authB = { userId: "staff-user-b", practiceId: practiceB.id, roleId: "n/a", permissions: [] };

    branchA = await prisma.branch.create({
      data: { practiceId: practiceA.id, name: "Main Branch A", workingHours: WORKING_HOURS },
    });
    customerA = await prisma.customer.create({
      data: { practiceId: practiceA.id, firstName: "Priya", mobile: "447700900321" },
    });
  });

  afterAll(async () => {
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  it("computes available slots from working hours, excluding existing bookings", async () => {
    const startTime = nextMonday10am();
    await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime,
    });

    const slots = await getAvailability(authA, branchA.id, { fromDate: new Date(Date.UTC(startTime.getUTCFullYear(), startTime.getUTCMonth(), startTime.getUTCDate())), days: 1 });
    const bookedSlotStillOffered = slots.some((s) => s.startTime.getTime() === startTime.getTime());
    expect(bookedSlotStillOffered).toBe(false);
  });

  it("creates a booking and prevents a second booking on the same overlapping slot", async () => {
    const startTime = nextMonday10am();
    const first = await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime,
    });
    expect(first.status).toBe("BOOKED");

    await expect(
      createBooking(authA, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime, // exact same slot
      }),
    ).rejects.toThrow("no longer available");

    // A partially-overlapping slot (starts 15 min into the first booking) is
    // also rejected, not just an exact-match start time.
    const overlapping = new Date(startTime.getTime() + 15 * 60_000);
    await expect(
      createBooking(authA, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime: overlapping,
      }),
    ).rejects.toThrow("no longer available");
  });

  it("rejects booking a slot in the past", async () => {
    await expect(
      createBooking(authA, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime: new Date("2020-01-01T09:00:00.000Z"),
      }),
    ).rejects.toThrow("past");
  });

  it("marking a conversation's booking BOOKED sends a confirmation message", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id },
    });

    await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
      conversationId: conversation.id,
    });

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updatedConversation.status).toBe("BOOKED");

    const messages = await prisma.message.findMany({ where: { conversationId: conversation.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe("SYSTEM");
    expect(messages[0].body).toContain("Eye exam");
  });

  it("cancelling a booking sets status to CANCELLED and frees the slot", async () => {
    const startTime = nextMonday10am();
    const booking = await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime,
    });

    const cancelled = await cancelBooking(authA, booking.id);
    expect(cancelled.status).toBe("CANCELLED");

    // Slot should be bookable again now.
    const rebooked = await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime,
    });
    expect(rebooked.status).toBe("BOOKED");
  });

  it("cannot cancel an already-cancelled booking", async () => {
    const booking = await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
    });
    await cancelBooking(authA, booking.id);

    await expect(cancelBooking(authA, booking.id)).rejects.toThrow("already cancelled");
  });

  it("updates booking status to COMPLETED / NO_SHOW", async () => {
    const booking = await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
    });

    const updated = await updateBookingStatus(authA, booking.id, "COMPLETED");
    expect(updated.status).toBe("COMPLETED");
  });

  it("does not let practice B see, fetch, or cancel practice A's booking", async () => {
    const booking = await createBooking(authA, {
      branchId: branchA.id,
      customerId: customerA.id,
      appointmentType: "Eye exam",
      startTime: nextMonday10am(),
    });

    const practiceBBookings = await listBookings(authB);
    expect(practiceBBookings).toHaveLength(0);

    await expect(getBooking(authB, booking.id)).rejects.toThrow("Resource not found");
    await expect(cancelBooking(authB, booking.id)).rejects.toThrow("Resource not found");
  });

  it("does not let practice B book against practice A's branch or customer", async () => {
    await expect(
      createBooking(authB, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime: nextMonday10am(),
      }),
    ).rejects.toThrow("Resource not found");
  });

  // Feeds Phase 9's campaign performance / revenue-recovered reporting -
  // see attributeBookingToCampaign() in bookingService.ts.
  describe("campaign attribution", () => {
    async function createCampaignFixture() {
      const template = await prisma.messageTemplate.create({
        data: {
          practiceId: practiceA.id,
          name: "Recall Template",
          channel: "whatsapp",
          providerTemplateName: "recall_template",
          bodyPreview: "Hi {{firstName}}, you're due for an eye test!",
        },
      });
      const templateType = await prisma.campaignTemplateType.findFirstOrThrow({ where: { key: "eye_test_recall" } });
      return prisma.campaign.create({
        data: {
          practiceId: practiceA.id,
          templateTypeId: templateType.id,
          messageTemplateId: template.id,
          name: "Test Recall Campaign",
          audienceFilter: {},
        },
      });
    }

    it("marks the CampaignRecipient booked when campaignId is given explicitly", async () => {
      const campaign = await createCampaignFixture();
      const recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          customerId: customerA.id,
          snapshotName: "Priya",
          snapshotChannel: "whatsapp",
          snapshotContact: "447700900321",
          status: "replied",
          repliedAt: new Date(),
        },
      });

      await createBooking(authA, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime: nextMonday10am(),
        campaignId: campaign.id,
      });

      const updated = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
      expect(updated.status).toBe("booked");
      expect(updated.bookedAt).not.toBeNull();
    });

    it("infers attribution from the most recent replied-but-unbooked recipient when campaignId is omitted", async () => {
      const campaign = await createCampaignFixture();
      const recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          customerId: customerA.id,
          snapshotName: "Priya",
          snapshotChannel: "whatsapp",
          snapshotContact: "447700900321",
          status: "replied",
          repliedAt: new Date(),
        },
      });

      await createBooking(authA, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime: nextMonday10am(),
        // no campaignId - should still be inferred
      });

      const updated = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
      expect(updated.status).toBe("booked");
      expect(updated.bookedAt).not.toBeNull();
    });

    it("does not attribute to a recipient that has no reply on record", async () => {
      const campaign = await createCampaignFixture();
      const recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          customerId: customerA.id,
          snapshotName: "Priya",
          snapshotChannel: "whatsapp",
          snapshotContact: "447700900321",
          status: "sent",
        },
      });

      await createBooking(authA, {
        branchId: branchA.id,
        customerId: customerA.id,
        appointmentType: "Eye exam",
        startTime: nextMonday10am(),
        // no campaignId, and the recipient was never marked replied
      });

      const unchanged = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
      expect(unchanged.status).toBe("sent");
      expect(unchanged.bookedAt).toBeNull();
    });
  });
});
