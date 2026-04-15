import { Request } from 'express';
import { AuthTokenPayload } from 'src/common/types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
