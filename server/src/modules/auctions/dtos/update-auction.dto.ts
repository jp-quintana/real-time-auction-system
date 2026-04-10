import { OmitType, PartialType, ApiSchema } from '@nestjs/swagger';
import { CreateAuctionDto } from './create-auction.dto';
import { AtLeastOneField } from 'src/common/decorators';

@ApiSchema({
  description:
    'At least one of the following fields must be provided: startingPrice, endTime.',
})
@AtLeastOneField<CreateAuctionDto>(['startingPrice', 'endTime'])
export class UpdateAuctionDto extends PartialType(
  OmitType(CreateAuctionDto, ['itemId', 'startTime'] as const),
) {}
