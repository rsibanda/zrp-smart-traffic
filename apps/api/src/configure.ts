import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { runtimeConfig } from './environment';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { addResponseContracts } from './response-contracts';

export function configure(app: INestApplication) {
  const settings = runtimeConfig();
  if (settings.trustProxy?.length)
    app.getHttpAdapter().getInstance().set('trust proxy', settings.trustProxy);
  app.use(helmet());
  app.use(
    (
      _req: unknown,
      res: { setHeader: (key: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: settings.origins,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  if (settings.production) return;
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ZRP Smart Traffic Management System')
      .setDescription(
        'Academic Prototype. Traffic management API; payments are simulated.',
      )
      .setVersion('0.1')
      .addBearerAuth()
      .build(),
  );
  addResponseContracts(document);
  SwaggerModule.setup('api/docs', app, document);
}
