import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ACCESS_TOKEN_COOKIE_NAME, ERROR_MESSAGES } from '../constants';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_IS_MISSING);
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow('ACCESS_TOKEN_SECRET'),
      });

      request['user'] = { ...payload };
    } catch (error) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_IS_INVALID);
    }
    return true;
  }

  private extractToken(request: Request) {
    return request.cookies?.[ACCESS_TOKEN_COOKIE_NAME];
  }
}
