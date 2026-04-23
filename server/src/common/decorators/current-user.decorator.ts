import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthTokenPayload } from 'src/modules/auth/types';

export const CurrentUser = createParamDecorator(
  <K extends keyof AuthTokenPayload>(
    data: K | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest<Request>();

    if (!request.user) {
      throw new UnauthorizedException();
    }

    return data && request.user[data] !== undefined
      ? request.user[data]
      : request.user;
  },
);
