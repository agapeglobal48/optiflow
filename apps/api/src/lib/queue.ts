import IORedis from "ioredis";
import { Queue } from "bullmq";
import { env } from "../config/env";

// BullMQ requires this specific option on the underlying ioredis
// connection - without it, BullMQ's internal retry/blocking commands
// misbehave. This connection is shared by every queue in the app.
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Campaign sends: one job per recipient. A worker (built in Phase 5,
// alongside the actual WhatsApp provider integration) will consume this
// queue and perform the real send. For now, launching a campaign queues
// real jobs in Redis - they simply have no consumer yet.
export const campaignSendQueue = new Queue("campaign-sends", {
  connection: redisConnection,
});

export interface CampaignSendJobData {
  recipientId: string;
  campaignId: string;
}
