import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllConfigType } from './config/config.type';
import { ClassSerializerInterceptor, VersioningType } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { generateApi } from 'swagger-typescript-api';
import * as path from 'path';
import * as fs from 'fs';
import { useContainer } from 'class-validator';
import { ConfigService } from '@nestjs/config';
const morgan = require('morgan');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  const configService = app.get(ConfigService<AllConfigType>);

  app.enableShutdownHooks();
  app.setGlobalPrefix(
    configService.getOrThrow('app.apiPrefix', { infer: true }),
    {
      exclude: ['/'],
    },
  );
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.use(morgan('short'));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.use(json({ limit: '200mb' }));
  app.use(urlencoded({ extended: true, limit: '200mb' }));

  if (
    configService.getOrThrow('app.nodeEnv', { infer: true }) === 'development'
  ) {
    const options = new DocumentBuilder()
      .setTitle('API')
      .setDescription('API docs')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('docs', app, document);
    generateApi({
      spec: document as any,
      templates: path.resolve(process.cwd(), './api-templates'),
      httpClientType: 'axios',
      unwrapResponseData: true,
    })
      .then(({ files }) => {
        files.forEach(({ fileContent }) => {
          fs.writeFile('./src/_api.ts', fileContent, (err) => {
            if (err) console.log(err);
            else {
              if (fs.existsSync('../frontend')) {
                fs.copyFileSync('./src/_api.ts', '../frontend/src/_api.ts');
              }
            }
          });
        });
      })
      .catch((e) => console.error(e));
  }

  await app.listen(configService.getOrThrow('app.port', { infer: true }));
}
bootstrap();
