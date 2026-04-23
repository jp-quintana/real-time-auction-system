import { NotificationsProcessor } from '../src/modules/notifications/notifications.processor';
import type { MailerService } from '@nestjs-modules/mailer';
import type { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import {
  JOB_NOTIFICATION_AUCTION_CLOSED,
  JOB_NOTIFICATION_AUCTION_WON,
  JOB_NOTIFICATION_OUTBID,
} from 'src/common/constants';

describe('NotificationsProcessor', () => {
  let processor: NotificationsProcessor;
  let sendMail: jest.Mock;
  let getOrThrow: jest.Mock;

  beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'unit-test' });
    // Returning 'production' skips the preview-email side effect (nodemailer.getTestMessageUrl)
    getOrThrow = jest.fn().mockReturnValue('production');
    processor = new NotificationsProcessor(
      { sendMail } as unknown as MailerService,
      { getOrThrow } as unknown as ConfigService,
    );
  });

  function makeJob<N extends string, T>(name: N, data: T): Job<T, void, N> {
    return { name, data } as unknown as Job<T, void, N>;
  }

  it('sends an outbid email to the previous high bidder with the relevant amounts', async () => {
    await processor.process(
      makeJob(JOB_NOTIFICATION_OUTBID, {
        auctionId: 'auc-1',
        previousHighBidderEmail: 'prev@test.com',
        previousHighBidAmount: 100,
        newHighBidAmount: 150,
      }),
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg).toMatchObject({
      to: 'prev@test.com',
      subject: 'You were outbid!',
    });
    expect(arg.html).toContain('auc-1');
    expect(arg.html).toContain('100');
    expect(arg.html).toContain('150');
  });

  it('sends an auction-won email to the winner', async () => {
    await processor.process(
      makeJob(JOB_NOTIFICATION_AUCTION_WON, {
        auctionId: 'auc-2',
        winnerEmail: 'winner@test.com',
        winnerBidAmount: 300,
      }),
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'winner@test.com',
        subject: 'You won!',
        html: expect.stringContaining('300'),
      }),
    );
  });

  it('sends an auction-closed email with winner details when there is a winner', async () => {
    await processor.process(
      makeJob(JOB_NOTIFICATION_AUCTION_CLOSED, {
        itemId: 'item-1',
        sellerEmail: 'seller@test.com',
        winnerId: 'user-99',
        winnerBidAmount: 400,
      }),
    );

    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('seller@test.com');
    expect(arg.subject).toBe('Auction closed!');
    expect(arg.html).toContain('item-1');
    expect(arg.html).toContain('user-99');
    expect(arg.html).toContain('400');
  });

  it('sends an auction-closed email with a no-bids message when there is no winner', async () => {
    await processor.process(
      makeJob(JOB_NOTIFICATION_AUCTION_CLOSED, {
        itemId: 'item-2',
        sellerEmail: 'seller2@test.com',
        winnerId: null,
        winnerBidAmount: null,
      }),
    );

    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('seller2@test.com');
    expect(arg.html).toContain('No bids were received');
  });

  it('does not call the mailer for unknown job names', async () => {
    await processor.process(
      makeJob('unknown-event', {}) as unknown as Parameters<
        NotificationsProcessor['process']
      >[0],
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
