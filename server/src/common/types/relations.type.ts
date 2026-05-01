export type ItemsQueryRelations = { seller?: boolean; auctions?: boolean };
export type AuctionsQueryRelations = { item: boolean; bids?: boolean };
