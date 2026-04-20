import { Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from 'src/common/decorators';
import { AuthGuard, RolesGuard } from 'src/common/guards';
import type { AccessTokenPayload } from 'src/common/types';

@Roles('admin')
@UseGuards(AuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  controller() {}

  @Patch('auctions/:id/freeze')
  freezeAuction(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {}
}
