import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

const logger = new Logger('Worker');

async function bootstrap() {
  // createApplicationContext() boots NestJS without any HTTP server
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  app.enableShutdownHooks();

  logger.log('✅ BullMQ worker started — waiting for jobs');
}

bootstrap().catch((err) => {
  logger.error(`Worker failed to start: ${err.message}`, err.stack);
  process.exit(1);
});
