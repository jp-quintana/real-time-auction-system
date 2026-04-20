import { AUCTION_CANCELLED_REASONS } from 'src/common/constants';
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
  reason: (typeof AUCTION_CANCELLED_REASONS)[number];
}
