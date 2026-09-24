import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";

interface UpdateAiSettingsInput {
  confidenceThreshold?: number;
  blocklistTerms?: string[];
  promptVersion?: string;
}

export async function getAiSettings(auth: AuthContext) {
  return prisma.aiSettings.findUniqueOrThrow({ where: { practiceId: auth.practiceId } });
}

export async function updateAiSettings(auth: AuthContext, input: UpdateAiSettingsInput) {
  return prisma.aiSettings.update({
    where: { practiceId: auth.practiceId },
    data: input as never,
  });
}

// The kill switch is deliberately a separate, narrower action from general
// settings updates - it has its own permission (ai:kill_switch, distinct
// from ai:configure) so a practice can grant "can toggle AI off in an
// emergency" without also granting "can change confidence thresholds and
// blocklists".
export async function setAiKillSwitch(auth: AuthContext, enabled: boolean) {
  const updated = await prisma.aiSettings.update({
    where: { practiceId: auth.practiceId },
    data: { autoSendEnabled: enabled },
  });

  await prisma.auditLog.create({
    data: {
      practiceId: auth.practiceId,
      userId: auth.userId,
      action: "ai.kill_switch.toggle",
      metadata: { enabled },
    },
  });

  return updated;
}
