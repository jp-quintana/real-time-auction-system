import {
  AUCTION_UPDATE_STATUS_REASONS,
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
  reason: AuctionUpdateStatusReason;
}

export interface AuctionSuspendedEvent extends AuctionCancelledEvent {}

export interface AuctionResumedEvent {
  auctionId: string;
}

export type AuctionSort = (typeof AUCTION_SORT_VALUES)[number];

export type AuctionStatus = (typeof AUCTION_STATUS_VALUES)[number];

export type AuctionUpdateStatusReason =
  (typeof AUCTION_UPDATE_STATUS_REASONS)[number];
