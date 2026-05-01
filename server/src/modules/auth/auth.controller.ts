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
import { LoginUserDto } from './dtos';
import { RefreshGuard } from 'src/common/guards';
import { CurrentUser } from 'src/common/decorators';
import { TokenExpiredError } from '@nestjs/jwt';
import { ERROR_MESSAGES } from 'src/common/constants';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from './constants';
import type { AuthSession, RefreshTokenPayload } from './types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setCookies(res: Response, authSession: AuthSession) {
    const { access, refresh } = authSession;
    const isProd = this.configService.getOrThrow('NODE_ENV') === 'production';

    res.cookie(ACCESS_TOKEN_COOKIE_NAME, access.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: +this.configService.getOrThrow('ACCESS_TOKEN_COOKIE_MAX_AGE'),
    });

    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refresh.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      // path: '/api/v1/auth/refresh',
      maxAge: +this.configService.getOrThrow('REFRESH_TOKEN_COOKIE_MAX_AGE'),
    });
  }

  private clearCookies(res: Response) {
    const isProd = this.configService.getOrThrow('NODE_ENV') === 'production';

    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
    });

    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      // path: '/api/v1/auth/refresh',
    });
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: ERROR_MESSAGES.EMAIL_IN_USE })
  async register(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.authService.register(createUserDto);

    this.setCookies(res, payload);

    return { message: 'Success!' };
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 201, description: 'Logged in successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.INVALID_PASSWORD })
  @ApiResponse({ status: 404, description: ERROR_MESSAGES.USER_NOT_FOUND })
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
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE_NAME)
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiResponse({ status: 201, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: ERROR_MESSAGES.TOKEN_EXPIRED })
  async refresh(
    @CurrentUser() user: RefreshTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const payload = await this.authService.refresh(user);

      this.setCookies(res, payload);

      return { message: 'Success!' };
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        this.clearCookies(res);
        throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_EXPIRED);
      }
      throw error;
    }
  }
}
