import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from '../users/dtos';
import { AuthUser, JwtPayload } from 'src/common/types';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as sessionsSchema from './schemas';
import { LoginUserDto } from './dtos';
import { eq } from 'drizzle-orm';
import { parseTimeToMs } from 'src/common/helpers';
import { DATABASE_CONNECTION } from 'src/common/constants';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof sessionsSchema>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private async generateTokens(payload: JwtPayload, sessionId: string) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('ACCESS_TOKEN_SECRET'),
      expiresIn: this.configService.getOrThrow('ACCESS_TOKEN_TTL'),
    });

    const refreshToken = this.jwtService.sign(
      { ...payload, sessionId },
      {
        secret: this.configService.getOrThrow('REFRESH_TOKEN_SECRET'),
        expiresIn: this.configService.getOrThrow('REFRESH_TOKEN_TTL'),
      },
    );

    let hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    return {
      accessToken,
      refreshToken,
      hashedRefreshToken,
      accessTokenExpiresAt: new Date(
        Date.now() +
          parseTimeToMs(this.configService.getOrThrow('ACCESS_TOKEN_TTL')),
      ),
      refreshTokenExpiresAt: new Date(
        Date.now() +
          parseTimeToMs(this.configService.getOrThrow('REFRESH_TOKEN_TTL')),
      ),
    };
  }

  async register(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return await this.db.transaction(async (tx) => {
      let user;
      try {
        [user] = await this.usersService.create(
          {
            ...createUserDto,
            password: hashedPassword,
          },
          tx,
        );
      } catch (error: any) {
        if (error.code === '23505') {
          throw new ConflictException('Email already in use');
        }
        throw error;
      }

      const sessionId = crypto.randomUUID();
      const payload = { userId: user.id, email: user.email, role: user.role };

      const {
        accessToken,
        refreshToken,
        hashedRefreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      } = await this.generateTokens(payload, sessionId);

      const [session] = await tx
        .insert(sessionsSchema.sessions)
        .values({
          id: sessionId,
          hashedRefreshToken,
          expiresAt: refreshTokenExpiresAt,
          userId: user.id,
        })
        .returning();

      return {
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        session,
      };
    });
  }

  async login(loginUserDto: LoginUserDto) {
    const user = await this.usersService.findOneByEmail(loginUserDto.email);

    if (!user || user.deletedAt) throw new NotFoundException();

    const isPasswordValid = await bcrypt.compare(
      loginUserDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException();
    }

    const sessionId = crypto.randomUUID();
    const payload = { userId: user.id, email: user.email, role: user.role };

    const {
      accessToken,
      refreshToken,
      hashedRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    } = await this.generateTokens(payload, sessionId);

    await this.db.insert(sessionsSchema.sessions).values({
      id: sessionId,
      hashedRefreshToken,
      expiresAt: refreshTokenExpiresAt,
      userId: user.id,
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }

  async refresh(authUser: AuthUser) {
    const user = await this.usersService.findOneById(authUser.userId);

    if (!user || user.deletedAt) throw new NotFoundException();

    if (!authUser.refreshToken || !authUser.sessionId)
      throw new UnauthorizedException();

    const session = await this.db.query.sessions.findFirst({
      where: eq(sessionsSchema.sessions.id, authUser.sessionId),
    });

    if (!session || session.deletedAt)
      throw new TokenExpiredError('Refresh token has expired', new Date());

    const isValidRefreshToken = await bcrypt.compare(
      authUser.refreshToken,
      session.hashedRefreshToken,
    );

    if (!isValidRefreshToken) throw new UnauthorizedException();

    if (session.expiresAt < new Date()) {
      const now = new Date();
      await this.db
        .update(sessionsSchema.sessions)
        .set({
          deletedAt: now,
        })
        .where(eq(sessionsSchema.sessions.id, authUser.sessionId));
      throw new TokenExpiredError('Refresh token has expired', now);
    }

    const payload = { userId: user.id, email: user.email, role: user.role };

    const {
      accessToken,
      refreshToken,
      hashedRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    } = await this.generateTokens(payload, authUser.sessionId);

    await this.db
      .update(sessionsSchema.sessions)
      .set({
        hashedRefreshToken,
        expiresAt: refreshTokenExpiresAt,
      })
      .where(eq(sessionsSchema.sessions.id, authUser.sessionId));

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };
  }
}
