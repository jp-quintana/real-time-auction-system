import { Global, Module } from '@nestjs/common';
import { UsersCacheService } from './users-cache.service';

@Global()
@Module({
  providers: [UsersCacheService],
  exports: [UsersCacheService],
})
export class UsersCacheModule {}
