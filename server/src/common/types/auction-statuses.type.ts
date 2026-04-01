export const auctionStatusActive = 'active';
export const auctionStatusClosed = 'closed';
export const auctionStatusCancelled = 'cancelled';

export const auctionStatuses = [
  auctionStatusActive,
  auctionStatusClosed,
  auctionStatusCancelled,
] as const;

export type AuctionStatus = (typeof auctionStatuses)[number];
