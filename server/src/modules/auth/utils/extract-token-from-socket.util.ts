import { ACCESS_TOKEN_COOKIE_NAME } from 'src/common/constants';
import { parse } from 'cookie';
import { Socket } from 'src/common/types';

export const extractTokenFromSocket = (
  client: Socket,
  cookieName = ACCESS_TOKEN_COOKIE_NAME,
) => {
  const raw = client.handshake.headers.cookie;
  if (!raw) return null;
  return parse(raw)[cookieName] ?? null;
};
