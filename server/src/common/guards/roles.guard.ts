import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';
import { ERROR_MESSAGES } from '../constants';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) return true;

    const { user }: Request = context.switchToHttp().getRequest<Request>();

    if (!user)
      throw new UnauthorizedException(ERROR_MESSAGES.USER_UNAUTHENTICATED);

    if (!requiredRoles.includes(user?.role))
      throw new ForbiddenException(ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS);
    return true;
  }
}
