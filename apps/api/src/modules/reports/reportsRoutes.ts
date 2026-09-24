import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import { getOverview, listCampaignPerformance, getCampaignPerformance, getBookingsBreakdown } from "./reportsService";
import { toCsv } from "./csvBuilder";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

reportsRouter.get("/overview", requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const query = dateRangeSchema.parse(req.query);
    const overview = await getOverview(req.auth!, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    res.json(overview);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/campaigns", requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    res.json(await listCampaignPerformance(req.auth!));
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/campaigns/export.csv", requirePermission(PERMISSIONS.REPORTS_EXPORT), async (req, res, next) => {
  try {
    const rows = await listCampaignPerformance(req.auth!);
    const csv = toCsv(rows, [
      { header: "Campaign", value: (r) => r.campaignName },
      { header: "Status", value: (r) => r.status },
      { header: "Launched At", value: (r) => (r.launchedAt ? r.launchedAt.toISOString() : "") },
      { header: "Audience Size", value: (r) => r.estimatedAudienceSize },
      { header: "Suppressed", value: (r) => r.suppressedCount },
      { header: "Recipients", value: (r) => r.recipientsCount },
      { header: "Sent", value: (r) => r.sentCount },
      { header: "Delivered", value: (r) => r.deliveredCount },
      { header: "Replied", value: (r) => r.repliedCount },
      { header: "Booked", value: (r) => r.bookedCount },
      { header: "Reply Rate", value: (r) => (r.replyRate !== null ? (r.replyRate * 100).toFixed(1) + "%" : "") },
      { header: "Booking Rate", value: (r) => (r.bookingRate !== null ? (r.bookingRate * 100).toFixed(1) + "%" : "") },
      { header: "Estimated Revenue", value: (r) => (r.estimatedRevenue !== null ? r.estimatedRevenue.toFixed(2) : "") },
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-performance-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get("/campaigns/:id", requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    res.json(await getCampaignPerformance(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

const bookingsBreakdownQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

reportsRouter.get("/bookings", requirePermission(PERMISSIONS.REPORTS_VIEW), async (req, res, next) => {
  try {
    const query = bookingsBreakdownQuerySchema.parse(req.query);
    const breakdown = await getBookingsBreakdown(req.auth!, {
      branchId: query.branchId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    res.json(breakdown);
  } catch (err) {
    next(err);
  }
});
