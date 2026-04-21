import {
  AUCTION_CANCEL_REASONS,
  AUCTION_FREEZE_REASONS,
  AUCTION_SORT_VALUES,
} from '../constants';
import { AUCTION_STATUS_VALUES } from '../constants';
import { Bid } from 'src/modules/bids/types';

export interface BidPlacedEvent {
  bid: Bid;
  auctionEndTime: Date;
  previousHighBidderId: string | null;
}

export interface AuctionClosedEvent {
  auctionId: string;
  winningBid: {
    amount: number;
    bidderEmail: string;
  };
}

export interface AuctionCancelledEvent {
  auctionId: string;
  reason: AuctionCancelReason;
}

export interface AuctionSuspendedEvent {
  auctionId: string;
  reason: AuctionFreezeReason;
}

export interface AuctionResumedEvent {
  auctionId: string;
}

export type AuctionSort = (typeof AUCTION_SORT_VALUES)[number];

export type AuctionStatus = (typeof AUCTION_STATUS_VALUES)[number];

export type AuctionFreezeReason = (typeof AUCTION_FREEZE_REASONS)[number];

export type AuctionCancelReason = (typeof AUCTION_CANCEL_REASONS)[number];
