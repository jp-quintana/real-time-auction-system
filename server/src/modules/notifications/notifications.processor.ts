import { MailerService } from '@nestjs-modules/mailer';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import {
  NotificationQueueJobPayload,
  NotificationQueueJobName,
  OutbidJob,
  AuctionWonJob,
  AuctionClosedJob,
} from './types';
import {
  JOB_NOTIFICATION_AUCTION_CLOSED,
  JOB_NOTIFICATION_AUCTION_WON,
  JOB_NOTIFICATION_OUTBID,
} from 'src/common/constants';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  private previewEmail(info: any) {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Preview: ${previewUrl}`);
    }
  }

  async process(
    job: Job<NotificationQueueJobPayload, void, NotificationQueueJobName>,
  ): Promise<any> {
    switch (job.name) {
      case JOB_NOTIFICATION_OUTBID: {
        const {
          auctionId,
          previousHighBidderEmail,
          previousHighBidAmount,
          newHighBidAmount,
        } = (job as OutbidJob).data;

        // TODO: add url to auction page
        const info = await this.mailerService.sendMail({
          to: previousHighBidderEmail,
          subject: 'You were outbid!',
          html: `<h1>Hi there,</h1></br><p>Someone just placed a higher bid on auction with id ${auctionId}. Your bid of ${previousHighBidAmount}.00 is no longer the highest. New highest bid is: ${newHighBidAmount}</p>`,
        });

        if (this.configService.getOrThrow('NODE_ENV') !== 'production') {
          this.previewEmail(info);
        }

        return;
      }

      case JOB_NOTIFICATION_AUCTION_WON: {
        const { auctionId, winnerEmail, winnerBidAmount } = (
          job as AuctionWonJob
        ).data;

        const info = await this.mailerService.sendMail({
          to: winnerEmail,
          subject: 'You won!',
          html: `<h1>Congratulations,</h1><br /><p>Congratulations, you won auction with id ${auctionId} with a bid of $${winnerBidAmount}.00.</p>`,
        });

        if (this.configService.getOrThrow('NODE_ENV') !== 'production') {
          this.previewEmail(info);
        }

        return;
      }

      case JOB_NOTIFICATION_AUCTION_CLOSED: {
        const { itemId, sellerEmail, winnerId, winnerBidAmount } = (
          job as AuctionClosedJob
        ).data;

        const info = await this.mailerService.sendMail({
          to: sellerEmail,
          subject: 'Auction closed!',
          html: winnerId
            ? `<h1>Hi there,</h1><br /><p>Your auction for item with id ${itemId} has ended. The winning bid was $${winnerBidAmount}.00 from user with id ${winnerId}.</p>`
            : `<h1>Hi there,</h1><br /><p>Your auction for item with id ${itemId} has ended. No bids were received.</p>`,
        });

        if (this.configService.getOrThrow('NODE_ENV') !== 'production') {
          this.previewEmail(info);
        }

        return;
      }
      default: {
        return;
      }
    }
  }
}
