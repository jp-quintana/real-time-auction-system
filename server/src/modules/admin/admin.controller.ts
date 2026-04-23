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
import { AdminAuctionsQueryDto, CancelAuctionDto } from './dtos';

@Roles('admin')
@UseGuards(AuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // TODO: add admin_actions audit log table to store suspend reason
  @Patch('auctions/:id/freeze')
  async freezeAuction(
    @Param('id') id: string,
    @Body() freezeAuctionDto: FreezeAuctionDto,
  ) {
    return this.adminService.freezeAuction(id, freezeAuctionDto);
  }

  @Patch('auctions/:id/unfreeze')
  async unfreezeAuction(@Param('id') id: string) {
    return this.adminService.unfreezeAuction(id);
  }

  @Patch('auctions/:id/cancel')
  async cancelAuction(
    @Param('id') id: string,
    @Body() cancelAuctionDto: CancelAuctionDto,
  ) {
    return this.adminService.cancelAuction(id, cancelAuctionDto);
  }

  @Patch('users/:id/ban')
  async banUser(@Param('id') id: string) {
    await this.adminService.banUser(id);
    return { message: 'Success!' };
  }

  @Patch('users/:id/unban')
  async unBanUser(@Param('id') id: string) {
    await this.adminService.unbanUser(id);
    return { message: 'Success!' };
  }

  @Get('auctions')
  async findAllAuctions(@Query() adminAuctionsQueryDto: AdminAuctionsQueryDto) {
    return this.adminService.findAll(adminAuctionsQueryDto);
  }
}
