import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";

interface KnowledgeEntryInput {
  topic: string;
  question?: string;
  answer: string;
}

export async function listKnowledgeEntries(auth: AuthContext) {
  return prisma.knowledgeEntry.findMany({
    where: withTenant(auth, {}),
    orderBy: { topic: "asc" },
  });
}

export async function createKnowledgeEntry(auth: AuthContext, input: KnowledgeEntryInput) {
  return prisma.knowledgeEntry.create({ data: { practiceId: auth.practiceId, ...input } });
}

export async function updateKnowledgeEntry(auth: AuthContext, id: string, input: Partial<KnowledgeEntryInput>) {
  const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Knowledge base entry not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, existing.practiceId);
  return prisma.knowledgeEntry.update({ where: { id }, data: input });
}

export async function deleteKnowledgeEntry(auth: AuthContext, id: string): Promise<void> {
  const existing = await prisma.knowledgeEntry.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Knowledge base entry not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, existing.practiceId);
  await prisma.knowledgeEntry.delete({ where: { id } });
}
