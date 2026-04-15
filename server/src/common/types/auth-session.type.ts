import { Role } from './user-roles.type';

type TokenWithExpiry = {
  token: string;
  expiresAt: Date;
};

export interface AuthSession {
  access: TokenWithExpiry;
  refresh: TokenWithExpiry;
}

type TokenPayload = {
  userId: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
};

export type AccessTokenPayload = TokenPayload;

export type RefreshTokenPayload = TokenPayload & {
  sessionId: string;
  refreshToken: string;
};

export type AuthTokenPayload = AccessTokenPayload | RefreshTokenPayload;
