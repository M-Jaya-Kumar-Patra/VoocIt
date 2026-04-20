import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // IMPORTANT: Only listen to the PORT variable
  // Do NOT put a URL string here
  const port = process.env.PORT || 10000;
  await app.listen(port, '0.0.0.0'); // '0.0.0.0' allows external connections
  console.log(`Application is running on port: ${port}`);
}
bootstrap();
bootstrap();
