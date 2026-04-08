import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as usersSchema from './schemas';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateUserDto } from './dtos';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, ERROR_MESSAGES } from 'src/common/constants';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
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

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    return user;
  }

  async findOneByEmail(email: string, tx?: any) {
    const db = tx || this.db;

    const user = await db.query.users.findFirst({
      where: eq(usersSchema.users.email, email),
    });

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    return user;
  }

  async create(createUserDto: CreateUserDto, tx?: any) {
    const { confirmPassword, ...data } = createUserDto;

    const db = tx || this.db;

    return db.insert(usersSchema.users).values(data).returning();
  }
}
