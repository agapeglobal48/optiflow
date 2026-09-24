import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";
import { logger } from "../../lib/logger";
import { getWhatsAppProvider } from "../messaging/providerFactory";
import { getExternalCalendarProvider } from "./externalCalendarSync";
import { DEFAULT_SLOT_MINUTES } from "./availabilityService";

function notFound(message: string): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = 404;
  return err;
}

function badRequest(message: string): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = 400;
  return err;
}

function conflict(message: string): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = 409;
  return err;
}

async function findAppointmentForTenant(auth: AuthContext, appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw notFound("Appointment not found");
  assertSameTenant(auth, appointment.practiceId);
  return appointment;
}

interface CreateBookingInput {
  branchId: string;
  customerId: string;
  appointmentType: string;
  startTime: Date;
  endTime?: Date;
  conversationId?: string;
  campaignId?: string;
}

/**
 * Creates a booking with double-booking prevention. Two layers, deliberately:
 *  1. An explicit overlap query before insert, so a normal conflicting
 *     request gets a clean 409 with a helpful message.
 *  2. The DB-level @@unique([branchId, startTime, source]) constraint (see
 *     schema.prisma) as a last-resort guard against a race between two
 *     concurrent requests for the exact same start time - caught below as
 *     a Prisma P2002 error and turned into the same 409.
 *
 * If conversationId is provided, this also marks that conversation BOOKED
 * and sends a WhatsApp confirmation message. That send is best-effort: a
 * provider failure is logged but does not roll back the booking itself -
 * the appointment is the source of truth, not the confirmation text.
 */
export async function createBooking(auth: AuthContext, input: CreateBookingInput) {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch || branch.deletedAt) throw notFound("Branch not found");
  assertSameTenant(auth, branch.practiceId);

  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer || customer.deletedAt) throw notFound("Customer not found");
  assertSameTenant(auth, customer.practiceId);

  const startTime = input.startTime;
  const endTime = input.endTime ?? new Date(startTime.getTime() + DEFAULT_SLOT_MINUTES * 60_000);

  if (endTime <= startTime) throw badRequest("endTime must be after startTime");
  if (startTime < new Date()) throw badRequest("Cannot book a slot in the past");

  let conversation: { id: string; practiceId: string } | null = null;
  if (input.conversationId) {
    conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conversation) throw notFound("Conversation not found");
    assertSameTenant(auth, conversation.practiceId);
  }

  const overlapping = await prisma.appointment.findFirst({
    where: {
      branchId: input.branchId,
      status: "BOOKED",
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (overlapping) throw conflict("That slot is no longer available at this branch");

  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        practiceId: auth.practiceId,
        branchId: input.branchId,
        customerId: input.customerId,
        appointmentType: input.appointmentType,
        startTime,
        endTime,
        status: "BOOKED",
        source: "internal",
        campaignId: input.campaignId,
        conversationId: input.conversationId,
      },
    });
  } catch (err) {
    // Prisma's unique-constraint violation code, checked structurally rather
    // than via `instanceof Prisma.PrismaClientKnownRequestError` so this
    // doesn't depend on importing the generated Prisma namespace (kept
    // consistent with the rest of this codebase - see lib/tenantGuard.ts).
    if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "P2002") {
      throw conflict("That slot is no longer available at this branch");
    }
    throw err;
  }

  // external calendar sync (stub) - see externalCalendarSync.ts
  const externalSync = await getExternalCalendarProvider().syncBooking({
    id: appointment.id,
    branchId: appointment.branchId,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    appointmentType: appointment.appointmentType,
  });
  if (externalSync) {
    appointment = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { externalRef: externalSync.externalRef, source: "external_calendar" },
    });
  }

  if (conversation) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "BOOKED" } });
    await sendBookingConfirmation({ conversationId: conversation.id, customer, appointment, branch });
  }

  // Campaign funnel attribution (queued -> sent -> delivered -> replied ->
  // booked, see CampaignRecipient in schema.prisma) - this is what Phase 9's
  // campaign performance / revenue-recovered reporting reads. Best-effort:
  // a booking is never blocked or rolled back by this.
  await attributeBookingToCampaign(appointment.customerId, input.campaignId);

  await prisma.auditLog.create({
    data: {
      practiceId: auth.practiceId,
      userId: auth.userId,
      action: "booking.created",
      entityType: "Appointment",
      entityId: appointment.id,
      metadata: { branchId: input.branchId, customerId: input.customerId, startTime: startTime.toISOString() },
    },
  });

  return appointment;
}

/**
 * Marks the CampaignRecipient row that led to this booking as "booked", so
 * campaign performance reporting (Phase 9) can show a real reply -> booking
 * conversion rate and attribute recovered revenue to the right campaign.
 *
 * If an explicit campaignId was given, attribute to that campaign directly.
 * Otherwise, infer it the same way webhookService.ts attributes an inbound
 * reply: the customer's most recent campaign send that's been replied to
 * but not yet booked. Silently does nothing if neither applies - not every
 * booking originates from a campaign (a walk-in or staff-initiated booking
 * has no CampaignRecipient to attribute to, and that's fine).
 */
async function attributeBookingToCampaign(customerId: string, campaignId?: string): Promise<void> {
  try {
    const recipient = campaignId
      ? await prisma.campaignRecipient.findFirst({
          where: { campaignId, customerId, bookedAt: null },
          orderBy: { createdAt: "desc" },
        })
      : await prisma.campaignRecipient.findFirst({
          where: { customerId, repliedAt: { not: null }, bookedAt: null },
          orderBy: { repliedAt: "desc" },
        });

    if (recipient) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "booked", bookedAt: new Date() },
      });
    }
  } catch (err) {
    logger.error({ err, customerId, campaignId }, "Failed to attribute booking to a campaign recipient");
  }
}

async function sendBookingConfirmation(params: {
  conversationId: string;
  customer: { mobile: string | null; email: string | null; firstName: string };
  appointment: { startTime: Date; appointmentType: string };
  branch: { name: string };
}): Promise<void> {
  const contact = params.customer.mobile ?? params.customer.email;
  if (!contact) {
    logger.warn({ conversationId: params.conversationId }, "Booking confirmed but customer has no contact method - skipping WhatsApp confirmation");
    return;
  }
  const channel = params.customer.mobile ? "whatsapp" : "email";

  const when = params.appointment.startTime.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const body = `You're booked! ${params.appointment.appointmentType} at ${params.branch.name} on ${when}. Reply here if you need to change anything.`;

  try {
    const provider = getWhatsAppProvider();
    const result = await provider.sendMessage({ to: contact, channel, templateName: "booking_confirmation", body });

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: params.conversationId,
          direction: "OUTBOUND",
          sender: "SYSTEM",
          channel,
          body,
          providerMessageId: result.providerMessageId,
          status: "sent",
        },
      }),
      prisma.conversation.update({
        where: { id: params.conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (err) {
    // Booking already succeeded - a failed confirmation message must not
    // roll it back. Logged for staff to follow up manually if needed.
    logger.error({ err, conversationId: params.conversationId }, "Failed to send booking confirmation message");
  }
}

interface ListBookingsFilters {
  branchId?: string;
  customerId?: string;
  status?: string;
  from?: Date;
  to?: Date;
}

export async function listBookings(auth: AuthContext, filters: ListBookingsFilters = {}) {
  return prisma.appointment.findMany({
    where: withTenant(auth, {
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.from || filters.to
        ? {
            startTime: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lt: filters.to } : {}),
            },
          }
        : {}),
    }),
    orderBy: { startTime: "asc" },
    include: {
      customer: { select: { firstName: true, lastName: true, mobile: true } },
      branch: { select: { name: true } },
    },
  });
}

export async function getBooking(auth: AuthContext, appointmentId: string) {
  const appointment = await findAppointmentForTenant(auth, appointmentId);
  return appointment;
}

export async function cancelBooking(auth: AuthContext, appointmentId: string) {
  const appointment = await findAppointmentForTenant(auth, appointmentId);
  if (appointment.status === "CANCELLED") throw badRequest("Appointment is already cancelled");

  const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });

  if (appointment.externalRef) {
    // external calendar sync (stub) - see externalCalendarSync.ts
    await getExternalCalendarProvider().removeBooking(appointment.externalRef);
  }

  await prisma.auditLog.create({
    data: {
      practiceId: auth.practiceId,
      userId: auth.userId,
      action: "booking.cancelled",
      entityType: "Appointment",
      entityId: appointment.id,
    },
  });

  return updated;
}

export async function updateBookingStatus(auth: AuthContext, appointmentId: string, status: "COMPLETED" | "NO_SHOW") {
  const appointment = await findAppointmentForTenant(auth, appointmentId);
  if (appointment.status === "CANCELLED") throw badRequest("Cannot change status of a cancelled appointment");

  return prisma.appointment.update({ where: { id: appointmentId }, data: { status } });
}
