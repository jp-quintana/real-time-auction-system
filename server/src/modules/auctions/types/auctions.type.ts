import { AUCTION_CANCELLED_REASONS, AUCTION_SORT_VALUES } from '../constants';
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
  reason: AuctionCancelledReason;
}

export type AuctionSort = (typeof AUCTION_SORT_VALUES)[number];

export type AuctionStatus = (typeof AUCTION_STATUS_VALUES)[number];

export type AuctionCancelledReason = (typeof AUCTION_CANCELLED_REASONS)[number];
