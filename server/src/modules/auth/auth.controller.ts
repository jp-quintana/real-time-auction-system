import { Body, Controller, Post, Res } from '@nestjs/common';
import { CreateUserDto } from '../users/dtos';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { AuthTokens } from 'src/common/types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setCookies(res: Response, tokens: AuthTokens) {
    const { accessToken, refreshToken } = tokens;
    const isProd = this.configService.getOrThrow('NODE_ENV') === 'production';

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: +this.configService.getOrThrow('ACCESS_TOKEN_COOKIE_MAX_AGE'),
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/auth/refresh',
      maxAge: +this.configService.getOrThrow('REFRESH_TOKEN_COOKIE_MAX_AGE'),
    });
  }

  @Post('register')
  async register(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.authService.register(createUserDto);

    this.setCookies(res, payload);

    return { message: 'Success!' };
  }
}
