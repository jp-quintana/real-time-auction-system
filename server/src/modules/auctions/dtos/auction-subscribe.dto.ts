import { IsUUID } from 'class-validator';

export class AuctionSubscribeDto {
  @IsUUID()
  auctionId: string;
}
