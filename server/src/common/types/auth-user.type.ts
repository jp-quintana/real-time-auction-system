import { Role } from './user-roles.type';

export type AuthUser = {
  userId: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
  sessionId?: string;
  refreshToken?: string;
};
