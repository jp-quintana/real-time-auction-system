import { Role } from 'src/modules/users/types';

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
