import {
  Body,
  Controller,
  Delete,
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ERROR_MESSAGES } from 'src/common/constants';
import { ACCESS_TOKEN_COOKIE_NAME } from '../auth/constants';

@ApiTags('auctions')
@Controller('auctions')
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all auctions' })
  @ApiResponse({
    status: 200,
    description: 'List of auctions returned successfully',
  })
  findAll(@Query() auctionsQueryDto: AuctionsQueryDto) {
    return this.auctionsService.findAll(auctionsQueryDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get auction by ID' })
  @ApiResponse({ status: 200, description: 'Auction returned successfully' })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  findOneById(@Param('id') id: string) {
    return this.auctionsService.findOneById(id, { item: true, bids: true });
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
  @ApiOperation({ summary: 'Create a new auction' })
  @ApiResponse({ status: 201, description: 'Auction created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.ITEM_NOT_OWNER })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.ITEM_NOT_FOUND })
  @ApiResponse({
    status: 409,
    description: ERROR_MESSAGES.AUCTION_FOR_ITEM_ACTIVE,
  })
  create(
    @Body() createAuctionDto: CreateAuctionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.auctionsService.create(userId, createAuctionDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
  @ApiOperation({ summary: 'Update an auction' })
  @ApiBody({
    type: UpdateAuctionDto,
    description:
      'At least one of the following fields must be provided: startingPrice, endTime.',
  })
  @ApiResponse({ status: 200, description: 'Auction updated successfully' })
  @ApiResponse({ status: 400, description: ERROR_MESSAGES.MISSING_PROPERTIES })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.ITEM_NOT_OWNER })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  @ApiResponse({ status: 409, description: ERROR_MESSAGES.AUCTION_UPDATE_FAIL })
  update(
    @Param('id') id: string,
    @Body() updateAuctionDto: UpdateAuctionDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.auctionsService.update(id, userId, updateAuctionDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
  @ApiOperation({ summary: 'Delete an auction' })
  @ApiResponse({ status: 200, description: 'Auction deleted successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.ITEM_NOT_OWNER })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  @ApiResponse({ status: 409, description: ERROR_MESSAGES.AUCTION_DELETE_FAIL })
  delete(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.auctionsService.remove(id, userId);
  }
}
