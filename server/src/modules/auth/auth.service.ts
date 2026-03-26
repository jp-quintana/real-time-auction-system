import { Inject, Injectable } from '@nestjs/common';
import { CreateUserDto } from '../users/dtos';
import { JwtPayload } from 'src/common/types';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { TOKENS } from 'src/common/constants';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as sessionsSchema from './schemas';

@Injectable()
export class AuthService {
  constructor(
    @Inject(TOKENS.INFRA.DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof sessionsSchema>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private async generateTokens(payload: JwtPayload) {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('ACCESS_TOKEN_SECRET'),
      expiresIn: this.configService.getOrThrow('ACCESS_TOKEN_TTL'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow('REFRESH_TOKEN_SECRET'),
      expiresIn: this.configService.getOrThrow('REFRESH_TOKEN_TTL'),
    });

    let hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    const { exp: accessExp } = this.jwtService.decode(accessToken) as {
      exp: number;
    };
    const { exp: refreshExp } = this.jwtService.decode(refreshToken) as {
      exp: number;
    };

    return {
      accessToken,
      refreshToken,
      hashedRefreshToken,
      accessTokenExpiresAt: new Date(accessExp * 1000),
      refreshTokenExpiresAt: new Date(refreshExp * 1000),
    };
  }

  async register(createUserDto: CreateUserDto) {
    let hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    return await this.db.transaction(async (tx) => {
      const [user] = await this.usersService.create(
        {
          ...createUserDto,
          password: hashedPassword,
        },
        tx,
      );

      const payload = { userId: user.id, email: user.email };

      const {
        accessToken,
        refreshToken,
        hashedRefreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      } = await this.generateTokens(payload);

      await tx.insert(sessionsSchema.sessions).values({
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
    });
  }
}
