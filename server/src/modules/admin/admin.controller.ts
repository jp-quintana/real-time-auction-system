import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from 'src/common/decorators';
import { AuthGuard, RolesGuard } from 'src/common/guards';
import { FreezeAuctionDto } from './dtos/freeze-auction.dto';
import { AdminService } from './admin.service';

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
}
