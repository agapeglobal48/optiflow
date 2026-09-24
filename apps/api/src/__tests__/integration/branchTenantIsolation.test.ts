// INTEGRATION TEST - requires a real database (DATABASE_URL in .env pointing
// at a running Postgres, migrations applied). This is deliberately separate
// from the pure unit tests in __tests__/ which need no DB.
//
// This test exists because the build spec (section 14) requires proof -
// not just an assumption - that one practice's data is unreachable from
// another practice's authenticated context. Every future tenant-owned
// table should get a test like this.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { createBranch, listBranches, getBranch } from "../../modules/branches/branchService";
import { AuthContext } from "../../types/express";

describe("branch tenant isolation", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let authB: AuthContext;

  beforeAll(async () => {
    practiceA = await prisma.practice.create({ data: { name: "Test Practice A" } });
    practiceB = await prisma.practice.create({ data: { name: "Test Practice B" } });

    authA = { userId: "test-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };
    authB = { userId: "test-user-b", practiceId: practiceB.id, roleId: "n/a", permissions: [] };
  });

  afterAll(async () => {
    // Clean up everything created under these two test practices.
    await prisma.branch.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.practice.deleteMany({ where: { id: { in: [practiceA.id, practiceB.id] } } });
    await prisma.$disconnect();
  });

  it("does not let practice B see practice A's branches in a list", async () => {
    await createBranch(authA, { name: "A's Only Branch" });

    const branchesForB = await listBranches(authB);
    expect(branchesForB).toHaveLength(0);
  });

  it("does not let practice B fetch practice A's branch by ID directly", async () => {
    const branch = await createBranch(authA, { name: "A's Direct Fetch Branch" });

    await expect(getBranch(authB, branch.id)).rejects.toThrow("Resource not found");
  });

  it("does let practice A see its own branch", async () => {
    const branch = await createBranch(authA, { name: "A's Visible Branch" });

    const fetched = await getBranch(authA, branch.id);
    expect(fetched.id).toBe(branch.id);
  });
});
