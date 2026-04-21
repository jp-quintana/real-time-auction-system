import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { extractTokenFromSocket } from '../auth/utils';
import { AuthService } from '../auth/auth.service';
import type { Socket } from 'src/common/types';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AuctionClosedEvent,
  AuctionResumedEvent,
  AuctionSuspendedEvent,
  BidPlacedEvent,
} from './types';
import { AuctionsService } from './auctions.service';
import { AuctionSubscribeDto, AuctionUnsubscribeDto } from './dtos';
import {
  EVENT_AUCTION_CLOSED,
  EVENT_AUCTION_RESUMED,
  EVENT_AUCTION_SUSPENDED,
  EVENT_BID_PLACED,
} from 'src/common/constants';

@WebSocketGateway({ namespace: 'auctions' })
export class AuctionsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly auctionsService: AuctionsService,
  ) {}

  async handleConnection(client: Socket) {
    const accessToken = extractTokenFromSocket(client);
    if (!accessToken) return;

    const userData = await this.authService.verifyAccessToken(accessToken);
    if (!userData) return;

    client.data.user = userData;
    client.join(`user:${userData.userId}`);
    console.log(
      `WS connection ${client.id}: authenticated as ${userData.userId}`,
    );
  }

  @SubscribeMessage('auction:subscribe')
  async handleAuctionSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AuctionSubscribeDto,
  ) {
    const auction = await this.auctionsService.findOneById(payload.auctionId);
    client.join(`auction:${auction.id}`);
    return { ok: true };
  }

  @SubscribeMessage('auction:unsubscribe')
  async handleAuctionUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AuctionUnsubscribeDto,
  ) {
    client.leave(`auction:${payload.auctionId}`);
    return { ok: true };
  }

  @OnEvent(EVENT_BID_PLACED)
  handleBidPlaced(event: BidPlacedEvent) {
    this.server.to(`auction:${event.bid.auctionId}`).emit('bid:placed', {
      bidId: event.bid.id,
      auctionId: event.bid.auctionId,
      amount: event.bid.amount,
      bidderId: event.bid.bidderId,
      placedAt: event.bid.createdAt,
    });

    if (
      event.previousHighBidderId &&
      event.previousHighBidderId !== event.bid.bidderId
    ) {
      this.server.to(`user:${event.previousHighBidderId}`).emit('bid:outbid', {
        auctionId: event.bid.auctionId,
        newAmount: event.bid.amount,
      });
    }
  }

  @OnEvent(EVENT_AUCTION_CLOSED)
  handleAuctionClosed(event: AuctionClosedEvent) {
    this.server.to(`auction:${event.auctionId}`).emit('auction:closed', {
      auctionId: event.auctionId,
      winningBid: event.winningBid,
    });
  }

  @OnEvent(EVENT_AUCTION_SUSPENDED)
  handleAuctionSuspended(event: AuctionSuspendedEvent) {
    this.server.to(`auction:${event.auctionId}`).emit('auction:suspended', {
      auctionId: event.auctionId,
      reason: event.reason,
    });
  }

  @OnEvent(EVENT_AUCTION_RESUMED)
  handleAuctionResumed(event: AuctionResumedEvent) {
    this.server.to(`auction:${event.auctionId}`).emit('auction:resumed', {
      auctionId: event.auctionId,
    });
  }
}
