import { DefaultEventsMap, Socket as IoSocket } from 'socket.io';
import { AccessTokenPayload } from 'src/modules/auth/types';

export interface SocketData {
  user?: AccessTokenPayload;
}

export type Socket = IoSocket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;
