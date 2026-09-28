import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { addResponseContracts } from './response-contracts';

export function configure(app: INestApplication) {
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
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
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
