import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";

interface MessageTemplateInput {
  name: string;
  channel: string;
  providerTemplateName: string;
  bodyPreview: string;
}

export async function listMessageTemplates(auth: AuthContext) {
  return prisma.messageTemplate.findMany({
    where: withTenant(auth, {}),
    orderBy: { createdAt: "desc" },
  });
}

export async function getMessageTemplate(auth: AuthContext, id: string) {
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template) {
    const err = new Error("Message template not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, template.practiceId);
  return template;
}

export async function createMessageTemplate(auth: AuthContext, input: MessageTemplateInput) {
  return prisma.messageTemplate.create({
    data: { practiceId: auth.practiceId, ...input, isApproved: false },
  });
}

export async function updateMessageTemplate(
  auth: AuthContext,
  id: string,
  input: Partial<MessageTemplateInput> & { isApproved?: boolean },
) {
  // NOTE: in a real WhatsApp integration, isApproved should reflect
  // Meta/BSP's actual template approval status (set by a webhook, not a
  // person). Allowing it here via a manual PATCH is a placeholder until
  // Phase 5 wires up the real provider - flagged so it isn't mistaken for
  // the final behaviour.
  await getMessageTemplate(auth, id); // tenant check before write
  return prisma.messageTemplate.update({ where: { id }, data: input });
}
