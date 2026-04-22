import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ERROR_MESSAGES } from '../constants';
import { ACCESS_TOKEN_COOKIE_NAME } from 'src/modules/auth/constants';
import { UsersCacheService } from 'src/modules/users-cache/users-cache.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersCacheService: UsersCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_MISSING);
    }

    let payload;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow('ACCESS_TOKEN_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    // TODO: placeholder, replace in future
    if (await this.usersCacheService.isBannedUser(payload.userId))
      throw new ForbiddenException(ERROR_MESSAGES.USER_BANNED);

    request['user'] = { ...payload };
    return true;
  }

  private extractToken(request: Request) {
    return request.cookies?.[ACCESS_TOKEN_COOKIE_NAME];
  }
}
