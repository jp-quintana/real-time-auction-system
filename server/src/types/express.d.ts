import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        iat: number;
        exp: number;
        // accessToken?: string;
      };
      // refreshToken?: string;
      // isRefreshTokenExpired?: boolean;
    }
  }
}
