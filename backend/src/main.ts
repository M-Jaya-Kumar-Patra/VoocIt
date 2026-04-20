import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Enable CORS for your future Vercel frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 2. IMPORTANT: Port must be a number from the environment variable
  // Render will inject the correct port into process.env.PORT
  const port = process.env.PORT || 10000;

  // 3. Bind to 0.0.0.0 to ensure it's accessible externally
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server is internally listening on port: ${port}`);
}
bootstrap();
