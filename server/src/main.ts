import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PREFIX } from './common/constants';
import { RedisIoAdapter } from './adapters';
import { ConfigService } from '@nestjs/config';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from './modules/auth/constants';
import { InstanceInterceptor } from './interceptors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix(PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(cookieParser());

  app.useGlobalInterceptors(new InstanceInterceptor());

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Real-Time Auction Engine API')
      .setDescription(
        'API for a distributed real-time auction platform. Supports item listing, auction lifecycle management (create, update, cancel), bid placement, and live bid streaming via WebSockets.',
      )
      .setVersion('1.0')
      .addCookieAuth(ACCESS_TOKEN_COOKIE_NAME)
      .addCookieAuth(REFRESH_TOKEN_COOKIE_NAME)
      .build();

    SwaggerModule.setup(
      PREFIX + '/docs',
      app,
      () => SwaggerModule.createDocument(app, config),
      {
        swaggerOptions: {
          withCredentials: true,
        },
      },
    );
  }

  const configService = app.get(ConfigService);
  const redisIoAdapter = new RedisIoAdapter(app, configService);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
