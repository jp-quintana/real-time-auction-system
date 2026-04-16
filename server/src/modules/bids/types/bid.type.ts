export type Bid = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  amount: number;
  auctionId: string;
  bidderId: string | null;
};
