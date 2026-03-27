import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        iat: number;
        exp: number;
        sessionId?: string;
        refreshToken?: string;
        // accessToken?: string;
      };
    }
  }
}
