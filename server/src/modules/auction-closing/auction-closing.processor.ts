import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotFoundException } from '@nestjs/common';
import { AuctionClosingService } from './auction-closing.service';
import {
  AuctionClosingQueueJobName,
  AuctionClosingQueueJobPayload,
  CloseJob,
} from './types';
import { JOB_AUCTION_CLOSE } from 'src/common/constants';

@Processor('auction-closing')
export class AuctionClosingProcessor extends WorkerHost {
  constructor(private readonly auctionClosingService: AuctionClosingService) {
    super();
  }
  async process(
    job: Job<AuctionClosingQueueJobPayload, void, AuctionClosingQueueJobName>,
  ): Promise<any> {
    switch (job.name) {
      case JOB_AUCTION_CLOSE: {
        const { auctionId } = (job as CloseJob).data;
        try {
          await this.auctionClosingService.close(auctionId);
        } catch (error) {
          if (error instanceof NotFoundException) return;
          throw error;
        }

        return;
      }

      default: {
        return;
      }
    }
  }
}
