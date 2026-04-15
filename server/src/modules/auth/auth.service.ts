import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from '../users/dtos';
import {
  AccessTokenPayload,
  AuthSession,
  type Database,
  JwtPayload,
  RefreshTokenPayload,
} from 'src/common/types';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import * as sessionsSchema from './schemas';
import { LoginUserDto } from './dtos';
import { eq } from 'drizzle-orm';
import { parseTimeToMs } from 'src/common/utils';
import { DATABASE_CONNECTION, ERROR_MESSAGES } from 'src/common/constants';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
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

  async register(createUserDto: CreateUserDto): Promise<AuthSession> {
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
        if (error.cause.code === '23505') {
          throw new ConflictException(ERROR_MESSAGES.EMAIL_IN_USE);
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

      await tx.insert(sessionsSchema.sessions).values({
        id: sessionId,
        hashedRefreshToken,
        expiresAt: refreshTokenExpiresAt,
        userId: user.id,
      });

      return {
        access: { token: accessToken, expiresAt: accessTokenExpiresAt },
        refresh: { token: refreshToken, expiresAt: refreshTokenExpiresAt },
      };
    });
  }

  async login(loginUserDto: LoginUserDto): Promise<AuthSession> {
    const user = await this.usersService.findOneByEmail(loginUserDto.email);

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const isPasswordValid = await bcrypt.compare(
      loginUserDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(ERROR_MESSAGES.INVALID_PASSWORD);
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
      access: { token: accessToken, expiresAt: accessTokenExpiresAt },
      refresh: { token: refreshToken, expiresAt: refreshTokenExpiresAt },
    };
  }

  async refresh(sessionUser: RefreshTokenPayload): Promise<AuthSession> {
    const user = await this.usersService.findOneWithRoleById(
      sessionUser.userId,
    );

    if (!user || user.deletedAt)
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    if (!sessionUser.refreshToken || !sessionUser.sessionId)
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_MISSING);

    const session = await this.db.query.sessions.findFirst({
      where: eq(sessionsSchema.sessions.id, sessionUser.sessionId),
    });

    if (!session || session.deletedAt)
      throw new TokenExpiredError(
        ERROR_MESSAGES.REFRESH_TOKEN_EXPIRED,
        new Date(),
      );

    const isValidRefreshToken = await bcrypt.compare(
      sessionUser.refreshToken,
      session.hashedRefreshToken,
    );

    if (!isValidRefreshToken)
      throw new UnauthorizedException(ERROR_MESSAGES.REFRESH_TOKEN_INVALID);

    if (session.expiresAt < new Date()) {
      const now = new Date();
      await this.db
        .update(sessionsSchema.sessions)
        .set({
          deletedAt: now,
        })
        .where(eq(sessionsSchema.sessions.id, sessionUser.sessionId));
      throw new TokenExpiredError(ERROR_MESSAGES.REFRESH_TOKEN_EXPIRED, now);
    }

    const payload = { userId: user.id, email: user.email, role: user.role };

    const {
      accessToken,
      refreshToken,
      hashedRefreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    } = await this.generateTokens(payload, sessionUser.sessionId);

    await this.db
      .update(sessionsSchema.sessions)
      .set({
        hashedRefreshToken,
        expiresAt: refreshTokenExpiresAt,
      })
      .where(eq(sessionsSchema.sessions.id, sessionUser.sessionId));

    return {
      access: { token: accessToken, expiresAt: accessTokenExpiresAt },
      refresh: { token: refreshToken, expiresAt: refreshTokenExpiresAt },
    };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow('ACCESS_TOKEN_SECRET'),
      });
      return payload;
    } catch (error) {
      return null;
    }
  }
}
