import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";
import { buildAudienceWhereClause, AudienceFilter } from "./audienceFilter";
import { campaignSendQueue } from "../../lib/queue";

export class CampaignError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

const MAX_AUDIENCE_SIZE = 20_000; // same MVP guardrail rationale as CSV import

interface CreateCampaignInput {
  name: string;
  templateTypeKey: string;
  messageTemplateId: string;
  audienceFilter: AudienceFilter;
}

// Platform-wide, fixed catalogue (not practice-scoped) - the campaign
// builder needs this to populate its "campaign type" picker rather than
// hardcoding the keys seeded in prisma/seed.ts.
export async function listCampaignTemplateTypes() {
  return prisma.campaignTemplateType.findMany({ orderBy: { label: "asc" } });
}

export async function previewAudience(auth: AuthContext, filter: AudienceFilter) {
  const where = buildAudienceWhereClause(auth, filter);

  const [count, sample] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      take: 5,
      select: { id: true, firstName: true, lastName: true, mobile: true, email: true, recallDueDate: true },
    }),
  ]);

  return { count, sample };
}

export async function createCampaign(auth: AuthContext, input: CreateCampaignInput) {
  const templateType = await prisma.campaignTemplateType.findUnique({
    where: { key: input.templateTypeKey },
  });
  if (!templateType) {
    throw new CampaignError(`Unknown campaign template type "${input.templateTypeKey}"`, "UNKNOWN_TEMPLATE_TYPE", 404);
  }

  const messageTemplate = await prisma.messageTemplate.findUnique({
    where: { id: input.messageTemplateId },
  });
  if (!messageTemplate) {
    throw new CampaignError("Message template not found", "TEMPLATE_NOT_FOUND", 404);
  }
  assertSameTenant(auth, messageTemplate.practiceId);

  const { count } = await previewAudience(auth, input.audienceFilter);

  return prisma.campaign.create({
    data: {
      practiceId: auth.practiceId,
      templateTypeId: templateType.id,
      messageTemplateId: messageTemplate.id,
      name: input.name,
      audienceFilter: input.audienceFilter as never,
      status: "DRAFT",
      estimatedAudienceSize: count,
    },
  });
}

export async function listCampaigns(auth: AuthContext) {
  return prisma.campaign.findMany({
    where: withTenant(auth, {}),
    orderBy: { createdAt: "desc" },
    include: { templateType: true, messageTemplate: { select: { name: true, channel: true } } },
  });
}

export async function getCampaign(auth: AuthContext, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { templateType: true, messageTemplate: true },
  });
  if (!campaign) {
    const err = new Error("Campaign not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, campaign.practiceId);
  return campaign;
}

export async function listCampaignRecipients(auth: AuthContext, campaignId: string) {
  await getCampaign(auth, campaignId); // tenant check
  return prisma.campaignRecipient.findMany({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
  });
}

// The core of the module: snapshots the matching audience into immutable
// CampaignRecipient rows, applies suppression checks a SECOND time (a
// customer could have opted out or been added to the suppression list
// after import but before launch), and queues one send job per recipient.
export async function launchCampaign(auth: AuthContext, campaignId: string) {
  const campaign = await getCampaign(auth, campaignId);

  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    throw new CampaignError(
      `Campaign is already ${campaign.status.toLowerCase()} and cannot be launched again`,
      "ALREADY_LAUNCHED",
    );
  }

  const filter = campaign.audienceFilter as unknown as AudienceFilter;
  const where = buildAudienceWhereClause(auth, filter);

  const audienceCount = await prisma.customer.count({ where });
  if (audienceCount > MAX_AUDIENCE_SIZE) {
    throw new CampaignError(
      `Audience is ${audienceCount} customers, which exceeds the ${MAX_AUDIENCE_SIZE} limit for a single launch. Narrow the filter.`,
      "AUDIENCE_TOO_LARGE",
    );
  }

  const customers = await prisma.customer.findMany({ where });

  const suppressions = await prisma.suppressionEntry.findMany({
    where: withTenant(auth, {}),
    select: { mobile: true, email: true },
  });
  const suppressedMobiles = new Set(
    suppressions.map((s: { mobile: string | null }) => s.mobile).filter(Boolean),
  );
  const suppressedEmails = new Set(
    suppressions.map((s: { email: string | null }) => s.email).filter(Boolean),
  );

  let suppressedCount = 0;
  const recipientsData: {
    campaignId: string;
    customerId: string;
    snapshotName: string;
    snapshotChannel: string;
    snapshotContact: string;
    status: string;
  }[] = [];

  for (const customer of customers) {
    const isSuppressed =
      (customer.mobile && suppressedMobiles.has(customer.mobile)) ||
      (customer.email && suppressedEmails.has(customer.email));

    if (isSuppressed) {
      suppressedCount++;
      continue;
    }

    const channel = customer.mobile ? "whatsapp" : "email";
    const contact = customer.mobile ?? customer.email;
    if (!contact) {
      // Should be unreachable given the import-time validation rule
      // (name + at least one contact method required), but guarded rather
      // than assumed.
      suppressedCount++;
      continue;
    }

    recipientsData.push({
      campaignId: campaign.id,
      customerId: customer.id,
      snapshotName: `${customer.firstName} ${customer.lastName ?? ""}`.trim(),
      snapshotChannel: channel,
      snapshotContact: contact,
      status: "queued",
    });
  }

  if (recipientsData.length === 0) {
    throw new CampaignError(
      "No eligible recipients after applying suppression checks - nothing to launch",
      "EMPTY_AUDIENCE",
    );
  }

  await prisma.$transaction([
    prisma.campaignRecipient.createMany({ data: recipientsData }),
    prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "RUNNING",
        launchedAt: new Date(),
        estimatedAudienceSize: customers.length,
        suppressedCount,
      },
    }),
  ]);

  // createMany doesn't return the created rows in Postgres, so we fetch
  // them back to get their IDs for queueing.
  const createdRecipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id, status: "queued" },
    select: { id: true },
  });

  await campaignSendQueue.addBulk(
    createdRecipients.map((r: { id: string }) => ({
      name: "send-campaign-message",
      data: { recipientId: r.id, campaignId: campaign.id },
      opts: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400 }, // keep completed jobs 1 day for debugging, then clean up
        removeOnFail: { age: 604800 }, // keep failed jobs 7 days
      },
    })),
  );

  await prisma.auditLog.create({
    data: {
      practiceId: auth.practiceId,
      userId: auth.userId,
      action: "campaign.launch",
      entityType: "Campaign",
      entityId: campaign.id,
      metadata: { audienceSize: customers.length, queued: recipientsData.length, suppressedCount },
    },
  });

  return {
    campaignId: campaign.id,
    queuedCount: recipientsData.length,
    suppressedCount,
    totalAudience: customers.length,
  };
}

export async function pauseCampaign(auth: AuthContext, campaignId: string) {
  const campaign = await getCampaign(auth, campaignId);
  if (campaign.status !== "RUNNING") {
    throw new CampaignError("Only a running campaign can be paused", "INVALID_STATE");
  }
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
}

export async function resumeCampaign(auth: AuthContext, campaignId: string) {
  const campaign = await getCampaign(auth, campaignId);
  if (campaign.status !== "PAUSED") {
    throw new CampaignError("Only a paused campaign can be resumed", "INVALID_STATE");
  }
  return prisma.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });
}

export async function stopCampaign(auth: AuthContext, campaignId: string) {
  const campaign = await getCampaign(auth, campaignId);
  if (campaign.status !== "RUNNING" && campaign.status !== "PAUSED") {
    throw new CampaignError("Only a running or paused campaign can be stopped", "INVALID_STATE");
  }
  // NOTE: this does not remove already-queued jobs from Redis - a real
  // implementation needs the worker (Phase 5) to check campaign.status
  // before sending each queued job, so a stop takes effect even for jobs
  // already in the queue. Flagged here rather than silently incomplete.
  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "STOPPED", completedAt: new Date() },
  });
}
