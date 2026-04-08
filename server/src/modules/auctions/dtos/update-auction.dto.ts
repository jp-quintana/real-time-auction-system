import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAuctionDto } from './create-auction.dto';
import { AtLeastOneField } from 'src/common/decorators';

@AtLeastOneField<CreateAuctionDto>(['startingPrice', 'endTime'])
export class UpdateAuctionDto extends PartialType(
  OmitType(CreateAuctionDto, ['itemId', 'startTime'] as const),
) {}
