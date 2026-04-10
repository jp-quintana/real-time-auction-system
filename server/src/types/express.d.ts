import { Request } from 'express';
import { Role } from 'src/common/types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        role: Role;
        iat: number;
        exp: number;
        sessionId?: string;
        refreshToken?: string;
        // accessToken?: string;
      };
    }
  }
}
