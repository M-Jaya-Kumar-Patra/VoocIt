import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = parseInt(process.env.PORT || '10000', 10);

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server is internally listening on port: ${port}`);
}
bootstrap();
