import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuctionsService } from './auctions.service';
import { AuctionsQueryDto, CreateAuctionDto } from './dtos';
import { AuthGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { UpdateAuctionDto } from './dtos/update-auction.dto';

@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  findAll(@Query() auctionsQueryDto: AuctionsQueryDto) {
    return this.auctionsService.findAll(auctionsQueryDto);
  }

  @Get(':id')
  findOneById(@Param('id') id: string) {
    return this.auctionsService.findOneById(id, { item: true, bids: true });
  }

  @Post()
  @UseGuards(AuthGuard)
  create(
    @Body() createAuctionDto: CreateAuctionDto,
    @CurrentUser('userId') requestUserId: string,
  ) {
    return this.auctionsService.create(requestUserId, createAuctionDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateAuctionDto: UpdateAuctionDto,
    @CurrentUser('userId') requestUserId: string,
  ) {
    return this.auctionsService.update(id, requestUserId, updateAuctionDto);
  }
}
