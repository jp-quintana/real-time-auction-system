export type AuthUser = {
  userId: string;
  email: string;
  iat: number;
  exp: number;
  sessionId?: string;
  refreshToken?: string;
};
