import { describe, it, expect } from "vitest";
import { buildAudienceWhereClause } from "../modules/campaigns/audienceFilter";
import { AuthContext } from "../types/express";

const auth: AuthContext = {
  userId: "user-1",
  practiceId: "practice-1",
  roleId: "role-1",
  permissions: [],
};

describe("buildAudienceWhereClause", () => {
  it("always scopes to the caller's practice", () => {
    const where = buildAudienceWhereClause(auth, {});
    expect(where.practiceId).toBe("practice-1");
  });

  it("always excludes soft-deleted customers", () => {
    const where = buildAudienceWhereClause(auth, {});
    expect(where.deletedAt).toBeNull();
  });

  it("always excludes opted-out customers, even with no filter given", () => {
    const where = buildAudienceWhereClause(auth, {});
    expect(where.consentStatus).toEqual({ not: "OPTED_OUT" });
  });

  it("applies a branch filter when given", () => {
    const where = buildAudienceWhereClause(auth, { branchId: "branch-1" });
    expect(where.branchId).toBe("branch-1");
  });

  it("does not add a branchId key when not given", () => {
    const where = buildAudienceWhereClause(auth, {});
    expect(where.branchId).toBeUndefined();
  });

  it("builds a recallDueDate range from before and after", () => {
    const where = buildAudienceWhereClause(auth, {
      recallDueAfter: "2026-01-01",
      recallDueBefore: "2026-03-01",
    });
    const range = where.recallDueDate as { gte: Date; lte: Date };
    expect(range.gte.toISOString()).toContain("2026-01-01");
    expect(range.lte.toISOString()).toContain("2026-03-01");
  });

  it("builds a recallDueDate range with only one bound given", () => {
    const where = buildAudienceWhereClause(auth, { recallDueBefore: "2026-03-01" });
    const range = where.recallDueDate as { gte?: Date; lte: Date };
    expect(range.gte).toBeUndefined();
    expect(range.lte.toISOString()).toContain("2026-03-01");
  });

  it("applies an appointmentType filter when given", () => {
    const where = buildAudienceWhereClause(auth, { appointmentType: "Eye Test" });
    expect(where.appointmentType).toBe("Eye Test");
  });

  it("combines multiple filters together", () => {
    const where = buildAudienceWhereClause(auth, {
      branchId: "branch-1",
      appointmentType: "Eye Test",
      recallDueBefore: "2026-06-01",
    });
    expect(where.branchId).toBe("branch-1");
    expect(where.appointmentType).toBe("Eye Test");
    expect(where.recallDueDate).toBeDefined();
  });
});
