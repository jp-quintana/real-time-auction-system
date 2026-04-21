import { Request } from 'express';
import { AuthTokenPayload } from 'src/modules/auth/types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
