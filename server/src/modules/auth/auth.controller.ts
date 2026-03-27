import {
  Body,
  Controller,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from '../users/dtos';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import type { AuthTokens, AuthUser } from 'src/common/types';
import { LoginUserDto } from './dtos';
import { RefreshGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { TokenExpiredError } from '@nestjs/jwt';

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
      // path: '/api/v1/auth/refresh',
      maxAge: +this.configService.getOrThrow('REFRESH_TOKEN_COOKIE_MAX_AGE'),
    });
  }

  private clearCookies(res: Response) {
    const isProd = this.configService.getOrThrow('NODE_ENV') === 'production';

    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      // path: '/api/v1/auth/refresh',
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

  @Post('login')
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.authService.login(loginUserDto);

    this.setCookies(res, payload);

    return { message: 'Success!' };
  }

  @Post('refresh')
  @UseGuards(RefreshGuard)
  async refresh(
    @CurrentUser() authUser: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const payload = await this.authService.refresh(authUser);

      this.setCookies(res, payload);

      return { message: 'Success!' };
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        this.clearCookies(res);
      }
      throw new UnauthorizedException();
    }
  }
}
