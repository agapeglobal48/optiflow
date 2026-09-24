import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import { getAvailability } from "./availabilityService";
import { createBooking, listBookings, getBooking, cancelBooking, updateBookingStatus } from "./bookingService";

export const bookingsRouter = Router();

bookingsRouter.use(authenticate);

const availabilityQuerySchema = z.object({
  branchId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
  slotMinutes: z.coerce.number().int().min(5).max(240).optional(),
});

bookingsRouter.get("/availability", requirePermission(PERMISSIONS.BOOKINGS_VIEW), async (req, res, next) => {
  try {
    const query = availabilityQuerySchema.parse(req.query);
    const fromDate = query.date ? new Date(`${query.date}T00:00:00.000Z`) : undefined;
    const slots = await getAvailability(req.auth!, query.branchId, {
      fromDate,
      days: query.days,
      slotMinutes: query.slotMinutes,
    });
    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

const listQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(["BOOKED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

bookingsRouter.get("/", requirePermission(PERMISSIONS.BOOKINGS_VIEW), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const bookings = await listBookings(req.auth!, {
      branchId: query.branchId,
      customerId: query.customerId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    res.json(bookings);
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get("/:id", requirePermission(PERMISSIONS.BOOKINGS_VIEW), async (req, res, next) => {
  try {
    res.json(await getBooking(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

const createBookingSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  appointmentType: z.string().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  conversationId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
});

bookingsRouter.post("/", requirePermission(PERMISSIONS.BOOKINGS_CREATE), async (req, res, next) => {
  try {
    const input = createBookingSchema.parse(req.body);
    const appointment = await createBooking(req.auth!, {
      branchId: input.branchId,
      customerId: input.customerId,
      appointmentType: input.appointmentType,
      startTime: new Date(input.startTime),
      endTime: input.endTime ? new Date(input.endTime) : undefined,
      conversationId: input.conversationId,
      campaignId: input.campaignId,
    });
    res.status(201).json(appointment);
  } catch (err) {
    next(err);
  }
});

bookingsRouter.patch("/:id/cancel", requirePermission(PERMISSIONS.BOOKINGS_CANCEL), async (req, res, next) => {
  try {
    res.json(await cancelBooking(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(["COMPLETED", "NO_SHOW"]) });

bookingsRouter.patch("/:id/status", requirePermission(PERMISSIONS.BOOKINGS_CANCEL), async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    res.json(await updateBookingStatus(req.auth!, req.params.id, status));
  } catch (err) {
    next(err);
  }
});
