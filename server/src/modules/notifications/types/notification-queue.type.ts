import { Job } from 'bullmq';

export type NotificationQueueJobName =
  | 'outbid'
  | 'auction-won'
  | 'auction-closed';

export interface OutbidJobData {
  auctionId: string;
  previousHighBidderEmail: string;
  previousHighBidAmount: number;
  newHighBidAmount: number;
}
export interface AuctionWonData {
  auctionId: string;
  winnerEmail: string;
  winnerBidAmount: number;
}

export interface AuctionClosedData {
  itemId: string;
  sellerEmail: string;
  winnerId?: string;
  winnerBidAmount?: number;
}

export type NotificationQueueJobPayload =
  | OutbidJobData
  | AuctionWonData
  | AuctionClosedData;

export type OutbidJob = Job<OutbidJobData, void, 'outbid'>;
export type AuctionWonJob = Job<AuctionWonData, void, 'auction-won'>;
export type AuctionClosedJob = Job<AuctionClosedData, void, 'auction-closed'>;
