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
    if (request.cookies?.accessToken) {
      return request.cookies.accessToken;
    }

    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
