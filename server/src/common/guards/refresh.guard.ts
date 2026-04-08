import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ERROR_MESSAGES } from '../constants';

@Injectable()
export class RefreshGuard implements CanActivate {
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
        secret: this.configService.getOrThrow(ERROR_MESSAGES.TOKEN_IS_INVALID),
        ignoreExpiration: true,
      });

      request['user'] = { ...payload, refreshToken: token };
    } catch (err) {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractToken(request: Request) {
    if (request.cookies.refreshToken)
      return request.cookies.refreshToken as string;
    if (request.headers['refresh-token'])
      return request.headers['refresh-token'] as string;
    return undefined;
  }
}
