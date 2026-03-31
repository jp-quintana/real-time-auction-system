import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TOKENS } from 'src/common/constants';
import * as usersSchema from './schemas';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateUserDto } from './dtos';
import { eq } from 'drizzle-orm';

@Injectable()
export class UsersService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof usersSchema>,
  ) {}

  async findAll() {
    return this.db.query.users.findMany();
  }

  async findOneById(id: string, tx?: any) {
    const db = tx || this.db;

    const user = db.query.users.findFirst({
      where: eq(usersSchema.users.id, id),
      columns: {
        id: true,
        email: true,
      },
    });

    if (!user || user.deletedAt) throw new NotFoundException();

    return user;
  }

  async findOneByEmail(email: string, tx?: any) {
    const db = tx || this.db;

    const user = await db.query.users.findFirst({
      where: eq(usersSchema.users.email, email),
    });

    if (!user || user.deletedAt) throw new NotFoundException();

    return user;
  }

  async create(createUserDto: CreateUserDto, tx?: any) {
    const { confirmPassword, ...data } = createUserDto;

    const db = tx || this.db;

    return db.insert(usersSchema.users).values(data).returning();
  }
}
