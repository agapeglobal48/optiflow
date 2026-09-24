import { prisma } from "../../lib/prisma";
import { SYSTEM_ROLE_TEMPLATES } from "./permissions";

// Clones a system role template (e.g. "Practice Admin") into a new,
// practice-scoped Role row with the same permission set. Practices then own
// their copy and can diverge from the template later without affecting
// other practices or the template itself.
export async function cloneSystemRoleForPractice(
  templateKey: keyof typeof SYSTEM_ROLE_TEMPLATES,
  practiceId: string,
) {
  const template = SYSTEM_ROLE_TEMPLATES[templateKey];

  const systemRole = await prisma.role.findFirstOrThrow({
    where: { name: template.name, isSystem: true, practiceId: null },
  });

  const clonedRole = await prisma.role.create({
    data: { practiceId, name: template.name, isSystem: false },
  });

  const systemPermissions = await prisma.rolePermission.findMany({
    where: { roleId: systemRole.id },
  });

  await prisma.rolePermission.createMany({
    data: systemPermissions.map((rp: { permissionId: string }) => ({
      roleId: clonedRole.id,
      permissionId: rp.permissionId,
    })),
  });

  return clonedRole;
}
