import { MailerService } from '@nestjs-modules/mailer';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<any, void, 'outbid'>): Promise<any> {
    switch (job.name) {
      case 'outbid': {
        const {
          auctionId,
          previousHighBidderEmail,
          previousHighBidAmount,
          newHighBidAmount,
        } = job.data;

        // TODO: add url to auction page
        const info = await this.mailerService.sendMail({
          to: previousHighBidderEmail,
          subject: 'You were outbid!',
          html: `<h1>Hi there,</h1></br><p>Someone just placed a higher bid on auction with id ${auctionId}. Your bid of ${previousHighBidAmount}.00 is no longer the highest. New highest bid is: ${newHighBidAmount}</p>`,
        });

        if (this.configService.getOrThrow('NODE_ENV') !== 'production') {
          const previewUrl = nodemailer.getTestMessageUrl(info);
          if (previewUrl) {
            console.log(`Preview: ${previewUrl}`);
          }
        }
      }
      default: {
        return;
      }
    }
  }
}
