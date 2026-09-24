import { describe, it, expect } from "vitest";
import { withTenant, assertSameTenant } from "../lib/tenantGuard";
import { AuthContext } from "../types/express";

const authA: AuthContext = {
  userId: "user-1",
  practiceId: "practice-a",
  roleId: "role-1",
  permissions: [],
};

describe("withTenant", () => {
  it("injects practiceId from the auth context into a where clause", () => {
    const where = withTenant(authA, { status: "ACTIVE" });
    expect(where).toEqual({ status: "ACTIVE", practiceId: "practice-a" });
  });

  it("overwrites any accidental practiceId already present with the auth one", () => {
    // Defends against a bug where someone passes a client-supplied
    // practiceId into the where clause before calling withTenant.
    const where = withTenant(authA, { practiceId: "practice-b", status: "ACTIVE" } as {
      practiceId: string;
      status: string;
    });
    expect(where.practiceId).toBe("practice-a");
  });
});

describe("assertSameTenant", () => {
  it("does not throw when the resource belongs to the caller's tenant", () => {
    expect(() => assertSameTenant(authA, "practice-a")).not.toThrow();
  });

  it("throws a 404-shaped error when the resource belongs to a different tenant", () => {
    try {
      assertSameTenant(authA, "practice-b");
      expect.fail("expected assertSameTenant to throw");
    } catch (err) {
      expect((err as Error).message).toBe("Resource not found");
      expect((err as Error & { status: number }).status).toBe(404);
    }
  });
});
