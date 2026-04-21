import { Role } from 'src/modules/users/types';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}
