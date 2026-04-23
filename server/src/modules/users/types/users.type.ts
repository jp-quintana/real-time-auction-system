import { USER_ROLES } from 'src/modules/users/constants';

export type Role = (typeof USER_ROLES)[number];
