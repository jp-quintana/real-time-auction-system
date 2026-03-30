import { DEFAULT_PAGE_SIZE } from './pagination.constant';
import { DATABASE_CONNECTION } from './injection-tokens.constant';

export const TOKENS = {
  INFRA: { DATABASE_CONNECTION },
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE,
};
