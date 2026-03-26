import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from 'src/common/constants';
import * as usersSchema from './schemas';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateUserDto } from './dtos';

@Injectable()
export class UsersService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof usersSchema>,
  ) {}

  async findAll() {
    return this.db.query.users.findMany();
  }

  async create(createUserDto: CreateUserDto, tx?: any) {
    const { confirmPassword, ...data } = createUserDto;

    const db = tx || this.db;

    return db.insert(usersSchema.users).values(data).returning();
  }
}
