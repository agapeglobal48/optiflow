// INTEGRATION TEST - requires a real database, same as branchTenantIsolation.test.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { importCustomersFromCsv } from "../../modules/customers/importService";
import { listCustomers } from "../../modules/customers/customerService";
import { AuthContext } from "../../types/express";

describe("customer import tenant isolation and dedup", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let authB: AuthContext;

  beforeAll(async () => {
    practiceA = await prisma.practice.create({ data: { name: "Import Test Practice A" } });
    practiceB = await prisma.practice.create({ data: { name: "Import Test Practice B" } });

    authA = { userId: "test-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };
    authB = { userId: "test-user-b", practiceId: practiceB.id, roleId: "n/a", permissions: [] };
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.importBatch.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.suppressionEntry.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.practice.deleteMany({ where: { id: { in: [practiceA.id, practiceB.id] } } });
    await prisma.$disconnect();
  });

  it("imports valid rows and skips invalid ones with reasons", async () => {
    const csv =
      "First Name,Mobile,External ID\n" +
      "Jane,07700900000,ext-1\n" +
      ",07700900001,ext-2\n" + // missing name - should be skipped
      "John,,ext-3\n"; // no mobile/email - should be skipped

    const summary = await importCustomersFromCsv(authA, {
      filename: "test.csv",
      buffer: Buffer.from(csv),
    });

    expect(summary.importedCount).toBe(1);
    expect(summary.skippedCount).toBe(2);
    expect(summary.errors).toHaveLength(2);
  });

  it("does not let practice B see practice A's imported customers", async () => {
    const { customers } = await listCustomers(authB);
    expect(customers.filter((c: { externalId: string | null }) => c.externalId === "ext-1")).toHaveLength(0);
  });

  it("re-importing the same externalId updates rather than duplicates", async () => {
    const csv = "First Name,Mobile,External ID\nJane Updated,07700900099,ext-1\n";

    const summary = await importCustomersFromCsv(authA, { filename: "test2.csv", buffer: Buffer.from(csv) });
    expect(summary.updatedCount).toBe(1);
    expect(summary.importedCount).toBe(0);

    const { customers } = await listCustomers(authA, { search: "Jane Updated" });
    expect(customers).toHaveLength(1);
    expect(customers[0].mobile).toBe("07700900099");
  });

  it("marks a customer OPTED_OUT when their mobile is on the suppression list", async () => {
    await prisma.suppressionEntry.create({
      data: { practiceId: authA.practiceId, mobile: "07700900555", reason: "opt_out" },
    });

    const csv = "First Name,Mobile,External ID\nSuppressed Person,07700900555,ext-suppressed\n";
    await importCustomersFromCsv(authA, { filename: "test3.csv", buffer: Buffer.from(csv) });

    const { customers } = await listCustomers(authA, { search: "Suppressed Person" });
    expect(customers[0].consentStatus).toBe("OPTED_OUT");
  });

  it("does not apply practice A's suppression list to practice B's import", async () => {
    // Same mobile number as the suppressed one above, but imported for
    // practice B, which has no suppression entry for it.
    const csv = "First Name,Mobile,External ID\nDifferent Practice Person,07700900555,ext-b-1\n";
    await importCustomersFromCsv(authB, { filename: "test4.csv", buffer: Buffer.from(csv) });

    const { customers } = await listCustomers(authB, { search: "Different Practice Person" });
    expect(customers[0].consentStatus).toBe("UNKNOWN");
  });

  it("with no external ID, re-importing the same mobile updates the existing customer instead of duplicating it", async () => {
    const firstImport = "First Name,Mobile\nSaad,447700900700\n";
    await importCustomersFromCsv(authA, { filename: "noext1.csv", buffer: Buffer.from(firstImport) });

    const secondImport = "First Name,Mobile,Email\nSaad,447700900700,saad@example.com\n";
    const summary = await importCustomersFromCsv(authA, { filename: "noext2.csv", buffer: Buffer.from(secondImport) });

    expect(summary.importedCount).toBe(0);
    expect(summary.updatedCount).toBe(1);

    const { customers } = await listCustomers(authA, { search: "447700900700" });
    expect(customers).toHaveLength(1);
    expect(customers[0].email).toBe("saad@example.com");
  });

  it("with no external ID and no mobile, re-importing the same email updates the existing customer", async () => {
    const firstImport = "First Name,Email\nNoMobile Person,nomobile@example.com\n";
    await importCustomersFromCsv(authA, { filename: "noext3.csv", buffer: Buffer.from(firstImport) });

    const secondImport = "First Name,Email,Type\nNoMobile Person Updated,nomobile@example.com,Contact Lens Check\n";
    const summary = await importCustomersFromCsv(authA, { filename: "noext4.csv", buffer: Buffer.from(secondImport) });

    expect(summary.importedCount).toBe(0);
    expect(summary.updatedCount).toBe(1);

    const { customers } = await listCustomers(authA, { search: "nomobile@example.com" });
    expect(customers).toHaveLength(1);
    expect(customers[0].firstName).toBe("NoMobile Person Updated");
  });

  it("does not let practice B's mobile-fallback match reach into practice A's customers", async () => {
    // Same mobile as the "Saad" customer created in practice A above, but
    // imported for practice B - must create a new row there, not update A's.
    const csv = "First Name,Mobile\nDifferent Saad,447700900700\n";
    const summary = await importCustomersFromCsv(authB, { filename: "noext5.csv", buffer: Buffer.from(csv) });

    expect(summary.importedCount).toBe(1);
    expect(summary.updatedCount).toBe(0);

    const { customers: fromA } = await listCustomers(authA, { search: "447700900700" });
    expect(fromA).toHaveLength(1);
    expect(fromA[0].firstName).toBe("Saad");
  });
});
