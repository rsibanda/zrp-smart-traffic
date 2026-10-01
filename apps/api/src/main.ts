import 'reflect-metadata';
import { runtimeConfig } from './environment';
import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configure } from './configure';

config({ path: resolve(__dirname, '../../../.env') });
async function bootstrap() {
  const settings = runtimeConfig();
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  configure(app);
  app.enableShutdownHooks();
  await app.listen(settings.port, settings.host);
}
void bootstrap();
