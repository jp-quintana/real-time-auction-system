export const userRole = 'user';
export const adminRole = 'admin';
export const roles = [userRole, adminRole] as const;

export type Role = (typeof roles)[number];
