import { Role } from './user-roles.type';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}
