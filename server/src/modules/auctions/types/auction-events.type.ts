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
