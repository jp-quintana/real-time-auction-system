import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators';
import { AuthGuard, RolesGuard } from 'src/common/guards';
import { FreezeAuctionDto } from './dtos/freeze-auction.dto';
import { AdminService } from './admin.service';
import {
  AdminAuctionsQueryDto,
  AdminSuspiciousAuctionsQueryDto,
  CancelAuctionDto,
} from './dtos';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { ERROR_MESSAGES } from 'src/common/constants';
import { ACCESS_TOKEN_COOKIE_NAME } from '../auth/constants';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
@Roles('admin')
@UseGuards(AuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // TODO: add admin_actions audit log table to store suspend reason
  @Patch('auctions/:id/freeze')
  @ApiOperation({ summary: 'Freeze (suspend) an active auction' })
  @ApiResponse({ status: 200, description: 'Auction frozen successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  async freezeAuction(
    @Param('id') id: string,
    @Body() freezeAuctionDto: FreezeAuctionDto,
  ) {
    return this.adminService.freezeAuction(id, freezeAuctionDto);
  }

  @Patch('auctions/:id/unfreeze')
  @ApiOperation({ summary: 'Unfreeze (resume) a suspended auction' })
  @ApiResponse({ status: 200, description: 'Auction resumed successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  async unfreezeAuction(@Param('id') id: string) {
    return this.adminService.unfreezeAuction(id);
  }

  @Patch('auctions/:id/cancel')
  @ApiOperation({ summary: 'Cancel an active or suspended auction' })
  @ApiResponse({ status: 200, description: 'Auction cancelled successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.AUCTION_NOT_FOUND })
  async cancelAuction(
    @Param('id') id: string,
    @Body() cancelAuctionDto: CancelAuctionDto,
  ) {
    return this.adminService.cancelAuction(id, cancelAuctionDto);
  }

  @Patch('users/:id/ban')
  @ApiOperation({ summary: 'Ban a user' })
  @ApiResponse({ status: 200, description: 'User banned successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.USER_NOT_FOUND })
  async banUser(@Param('id') id: string) {
    await this.adminService.banUser(id);
    return { message: 'Success!' };
  }

  @Patch('users/:id/unban')
  @ApiOperation({ summary: 'Unban a user' })
  @ApiResponse({ status: 200, description: 'User unbanned successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.USER_NOT_FOUND })
  async unBanUser(@Param('id') id: string) {
    await this.adminService.unbanUser(id);
    return { message: 'Success!' };
  }

  @Get('auctions')
  @ApiOperation({ summary: 'Get all auctions (admin view)' })
  @ApiResponse({
    status: 200,
    description: 'List of auctions returned successfully',
  })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  async findAllAuctions(@Query() adminAuctionsQueryDto: AdminAuctionsQueryDto) {
    return this.adminService.findAll(adminAuctionsQueryDto);
  }

  @Get('auctions/suspicious')
  @ApiOperation({
    summary: 'Get auctions with bursty bidding activity in the last minute',
  })
  @ApiResponse({
    status: 200,
    description: 'List of suspicious auctions returned successfully',
  })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_MISSING })
  @ApiResponse({ status: 403, description: ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS })
  async findAllSuspiciousAuctions(
    @Query() adminSuspiciousAuctionsQueryDto: AdminSuspiciousAuctionsQueryDto,
  ) {
    return this.adminService.findAllSuspicious(adminSuspiciousAuctionsQueryDto);
  }
}
