import { Job } from 'bullmq';

export type AuctionClosingQueueJobName = 'close';

export type CloseJobData = { auctionId: string };

export type AuctionClosingQueueJobPayload = CloseJobData;

export type CloseJob = Job<CloseJobData, void, 'close'>;
