import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './core/database/prisma.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { AuditModule } from './core/audit/audit.module';
import { QueueModule } from './core/queue/queue.module';

/**
 * Minimal NestJS module for the BullMQ worker process.
 * No HTTP server is started — this is a background worker only.
 *
 * Includes:
 * - QueueModule  → registers all processors (DataSync, Analytics, Notifications)
 *                  and internally brings in RedisModule + WeezeventModule
 * - ScheduleModule → enables @Cron decorators (WeezeventCronService)
 * - PrismaModule   → @Global database access
 * - EncryptionModule → @Global credential decryption
 * - AuditModule    → lightweight audit logging
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'envFiles/.env.development',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    EncryptionModule,
    AuditModule,
    QueueModule,
  ],
})
export class WorkerModule {}
