import { Module } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, UsersModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
