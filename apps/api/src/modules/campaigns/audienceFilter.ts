import { AuthContext } from "../../types/express";
import { withTenant } from "../../lib/tenantGuard";

export interface AudienceFilter {
  branchId?: string;
  recallDueBefore?: string; // ISO date string, inclusive
  recallDueAfter?: string; // ISO date string, inclusive
  appointmentType?: string;
}

// A customer is only ever a valid campaign target if they're not
// soft-deleted and haven't opted out - this is enforced here regardless
// of what filter the caller supplies, so no audience filter can
// accidentally include an opted-out customer.
export function buildAudienceWhereClause(auth: AuthContext, filter: AudienceFilter) {
  const where = withTenant(auth, {
    deletedAt: null,
    consentStatus: { not: "OPTED_OUT" as const },
  }) as Record<string, unknown>;

  if (filter.branchId) {
    where.branchId = filter.branchId;
  }

  if (filter.recallDueBefore || filter.recallDueAfter) {
    const recallDueDate: Record<string, Date> = {};
    if (filter.recallDueBefore) recallDueDate.lte = new Date(filter.recallDueBefore);
    if (filter.recallDueAfter) recallDueDate.gte = new Date(filter.recallDueAfter);
    where.recallDueDate = recallDueDate;
  }

  if (filter.appointmentType) {
    where.appointmentType = filter.appointmentType;
  }

  return where;
}
