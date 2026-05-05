import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:4200'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  
  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();
