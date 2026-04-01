import { Inject, Injectable } from '@nestjs/common';
import { AuctionsQueryDto } from './dtos';
import { PAGINATION, TOKENS } from 'src/common/constants';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as auctionsSchema from './schemas';
import { and, eq, isNull } from 'drizzle-orm';
import { AuctionsQueryRelations } from 'src/common/types';

@Injectable()
export class AuctionsService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof auctionsSchema>,
  ) {}

  async findAll(
    auctionsQueryDto: AuctionsQueryDto,
    relations: AuctionsQueryRelations = {item: false, bids: false},
  ) {
    const page = auctionsQueryDto.page || 1;
    const pageSize = auctionsQueryDto.pageSize || PAGINATION.DEFAULT_PAGE_SIZE;

    return await this.db.query.auctions.findMany({
      where: and(
        isNull(auctionsSchema.auctions.deletedAt),
        auctionsQueryDto.status
          ? eq(auctionsSchema.auctions.status, auctionsQueryDto.status)
          : undefined,
      ),
      orderBy: (auctions, { desc }) => desc(auctions.createdAt),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      with: {
        ...(relations.item && {
          item: true,
        }),
        ...(relations.bids && {
          bids: true,
        }),
      },
    });
  }
}
