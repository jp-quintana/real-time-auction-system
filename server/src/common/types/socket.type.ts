import { DefaultEventsMap, Socket as IoSocket } from 'socket.io';
import { AccessTokenPayload } from './auth-session.type';

export interface SocketData {
  user?: AccessTokenPayload;
}

export type Socket = IoSocket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
