import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as usersSchema from './schemas';
import { CreateUserDto } from './dtos';
import { eq } from 'drizzle-orm';
import {
  DATABASE_CONNECTION_TOKEN,
  ERROR_MESSAGES,
} from 'src/common/constants';
import { Transaction, type Database } from 'src/common/types';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION_TOKEN)
    private readonly db: Database,
  ) {}

  async findAll() {
    return this.db.query.users.findMany();
  }

  async findOneById(id: string, tx?: Transaction) {
    const db = tx || this.db;

    const user = await db.query.users.findFirst({
      where: eq(usersSchema.users.id, id),
      columns: {
        id: true,
        email: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    return user;
  }

  // TODO: see if can be refactored
  async findOneWithRoleById(id: string, tx?: Transaction) {
    const db = tx || this.db;

    const user = await db.query.users.findFirst({
      where: eq(usersSchema.users.id, id),
      columns: {
        id: true,
        email: true,
        deletedAt: true,
        role: true,
      },
    });

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    return user;
  }

  async findOneByEmail(email: string, tx?: Transaction) {
    const db = tx || this.db;

    const user = await db.query.users.findFirst({
      where: eq(usersSchema.users.email, email),
    });

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    return user;
  }

  async create(createUserDto: CreateUserDto, tx?: Transaction) {
    const { confirmPassword, ...data } = createUserDto;

    const db = tx || this.db;

    return db.insert(usersSchema.users).values(data).returning();
  }
}
