import { PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS, SYSTEM_ROLE_TEMPLATES } from "../src/modules/rbac/permissions";
import { hashPassword } from "../src/modules/auth/passwordService";
import { cloneSystemRoleForPractice } from "../src/modules/rbac/roleCloning";
import { DEFAULT_FEATURE_FLAGS } from "../src/config/featureFlags";

const prisma = new PrismaClient();

const PLATFORM_PRACTICE_ID = "00000000-0000-0000-0000-00000000f00d";
const DEMO_PRACTICE_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  console.log("Seeding permission catalogue...");
  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: { key: perm.key, description: perm.description },
    });
  }

  console.log("Seeding system role templates...");
  for (const template of Object.values(SYSTEM_ROLE_TEMPLATES)) {
    const existing = await prisma.role.findFirst({
      where: { name: template.name, practiceId: null, isSystem: true },
    });

    const role =
      existing ??
      (await prisma.role.create({
        data: { name: template.name, isSystem: true, practiceId: null },
      }));

    for (const permKey of template.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // ── Platform practice + super admin ────────────────────────────────
  // Super-admins (OptiFlow's own team) still need to belong to a Practice
  // row for the schema's User.practiceId FK to stay non-null - this
  // "platform" row is that internal home. It's excluded from
  // listPractices() via the isPlatform flag.
  console.log("Creating platform practice + super admin user...");
  const platformPractice = await prisma.practice.upsert({
    where: { id: PLATFORM_PRACTICE_ID },
    update: {},
    create: {
      id: PLATFORM_PRACTICE_ID,
      name: "OptiFlow (Platform)",
      status: "ACTIVE",
      isPlatform: true,
    },
  });

  let superAdminRole = await prisma.role.findFirst({
    where: { practiceId: platformPractice.id, name: SYSTEM_ROLE_TEMPLATES.SUPER_ADMIN.name },
  });
  if (!superAdminRole) {
    superAdminRole = await cloneSystemRoleForPractice("SUPER_ADMIN", platformPractice.id);
  }

  const superAdminPasswordHash = await hashPassword("SuperAdminPass123!");
  await prisma.user.upsert({
    where: {
      practiceId_email: { practiceId: platformPractice.id, email: "superadmin@optiflow.test" },
    },
    update: {},
    create: {
      practiceId: platformPractice.id,
      email: "superadmin@optiflow.test",
      passwordHash: superAdminPasswordHash,
      firstName: "OptiFlow",
      lastName: "Admin",
      roleId: superAdminRole.id,
    },
  });

  // ── Demo optical practice ──────────────────────────────────────────
  console.log("Creating demo practice + admin user for local development...");
  const demoPractice = await prisma.practice.upsert({
    where: { id: DEMO_PRACTICE_ID },
    update: { whatsappPhoneNumberId: "mock-phone-demo-001" },
    create: {
      id: DEMO_PRACTICE_ID,
      name: "Demo Optical Practice",
      status: "ACTIVE",
      defaultAppointmentValue: 85.0,
      // Fake ID for local testing against the mock provider and
      // hand-crafted webhook payloads - a real deployment gets this from
      // Meta when the practice's WhatsApp Business number is registered.
      whatsappPhoneNumberId: "mock-phone-demo-001",
    },
  });

  let practiceAdminRole = await prisma.role.findFirst({
    where: { practiceId: demoPractice.id, name: SYSTEM_ROLE_TEMPLATES.PRACTICE_ADMIN.name },
  });
  if (!practiceAdminRole) {
    practiceAdminRole = await cloneSystemRoleForPractice("PRACTICE_ADMIN", demoPractice.id);
  }

  // Default AI settings + feature flags - every practice needs these to
  // exist so the rest of the app never has to treat "missing row" as "off".
  await prisma.aiSettings.upsert({
    where: { practiceId: demoPractice.id },
    update: {},
    create: { practiceId: demoPractice.id },
  });

  for (const flag of DEFAULT_FEATURE_FLAGS) {
    await prisma.practiceFeatureFlag.upsert({
      where: { practiceId_key: { practiceId: demoPractice.id, key: flag.key } },
      update: {},
      create: { practiceId: demoPractice.id, key: flag.key, enabled: flag.enabled },
    });
  }

  const passwordHash = await hashPassword("DemoPassword123!");

  await prisma.user.upsert({
    where: { practiceId_email: { practiceId: demoPractice.id, email: "admin@demo-optical.test" } },
    update: {},
    create: {
      practiceId: demoPractice.id,
      email: "admin@demo-optical.test",
      passwordHash,
      firstName: "Demo",
      lastName: "Admin",
      roleId: practiceAdminRole.id,
    },
  });

  // A demo branch so the branches endpoints have something to return immediately.
  // workingHours is UTC "HH:mm" ranges per day (see src/modules/bookings/workingHours.ts) -
  // set here so Phase 8 booking/availability endpoints have real slots to
  // return without any manual setup.
  const demoWorkingHours = {
    mon: [{ open: "09:00", close: "17:00" }],
    tue: [{ open: "09:00", close: "17:00" }],
    wed: [{ open: "09:00", close: "17:00" }],
    thu: [{ open: "09:00", close: "17:00" }],
    fri: [{ open: "09:00", close: "17:00" }],
    sat: [{ open: "09:00", close: "13:00" }],
    sun: [],
  };
  await prisma.branch.upsert({
    where: { id: "00000000-0000-0000-0000-0000000000b1" },
    update: { workingHours: demoWorkingHours },
    create: {
      id: "00000000-0000-0000-0000-0000000000b1",
      practiceId: demoPractice.id,
      name: "High Street Branch",
      address: "1 High Street, London",
      workingHours: demoWorkingHours,
    },
  });

  // ── Campaign template type catalogue ───────────────────────────────
  // Fixed, platform-wide options a campaign can be built from - not
  // practice-scoped, similar in spirit to the permission catalogue.
  console.log("Seeding campaign template types...");
  const campaignTemplateTypes = [
    { key: "eye_test_recall", label: "Eye Test Recall", description: "Patient is due or overdue for a routine eye exam" },
    { key: "contact_lens_recall", label: "Contact Lens Check Recall", description: "Patient is due for a contact lens check-up" },
    { key: "lapsed_reactivation", label: "Lapsed Patient Reactivation", description: "Patient hasn't visited in a long time and needs re-engaging" },
    { key: "no_show_recovery", label: "No-Show Recovery", description: "Patient missed a booked appointment and needs rebooking" },
  ];
  for (const t of campaignTemplateTypes) {
    await prisma.campaignTemplateType.upsert({
      where: { key: t.key },
      update: { label: t.label, description: t.description },
      create: t,
    });
  }

  console.log("✅ Seed complete.");
  console.log("   Demo practice admin: admin@demo-optical.test / DemoPassword123!");
  console.log("   Super admin:         superadmin@optiflow.test / SuperAdminPass123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
