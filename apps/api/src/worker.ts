// Run with `npm run worker` - a SEPARATE process from the API (`npm run
// dev`/`npm start`). This mirrors how BullMQ is meant to be deployed: the
// API enqueues jobs, one or more independent worker processes consume
// them. In production these would typically be separate containers/dynos
// that can be scaled independently of the API.
import { Worker, Job } from "bullmq";
import { redisConnection } from "./lib/queue";
import { processCampaignSendJob } from "./modules/messaging/campaignSendProcessor";
import { CampaignSendJobData } from "./lib/queue";
import { logger } from "./lib/logger";
import { env } from "./config/env";

const worker = new Worker<CampaignSendJobData>(
  "campaign-sends",
  async (job: Job<CampaignSendJobData>) => {
    await processCampaignSendJob(job.data);
  },
  {
    connection: redisConnection,
    concurrency: 5, // process up to 5 sends in parallel
  },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, recipientId: job.data.recipientId }, "Campaign send job completed");
});

worker.on("failed", (job, err) => {
  logger.error(
    { jobId: job?.id, recipientId: job?.data?.recipientId, err: err.message },
    "Campaign send job failed",
  );
});

logger.info(`OptiFlow campaign-send worker started [provider=${env.WHATSAPP_PROVIDER}]`);
