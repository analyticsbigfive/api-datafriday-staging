import { Module } from '@nestjs/common';
import { RouterModule, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import * as Joi from 'joi';
import Redis from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/database/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { HealthModule } from './health/health.module';
import { OnboardingModule } from './features/onboarding/onboarding.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { CacheModule } from './core/cache/cache.module';
import { RedisModule } from './core/redis/redis.module';
import { QueueModule } from './core/queue/queue.module';
import { WeezeventModule } from './features/weezevent/weezevent.module';
import { OrganizationsModule } from './features/organizations/organizations.module';
import { IntegrationsModule } from './features/integrations/integrations.module';
import { MeModule } from './features/me/me.module';
import { TenantsModule } from './features/tenants/tenants.module';
import { SpacesModule } from './features/spaces/spaces.module';
import { UsersModule } from './features/users/users.module';
import { OrchestratorModule } from './features/orchestrator/orchestrator.module';
import { SuppliersModule } from './features/suppliers/suppliers.module';
import { MarketPricesModule } from './features/market-prices/market-prices.module';
import { MenuComponentsModule } from './features/menu-components/menu-components.module';
import { MenuItemsModule } from './features/menu-items/menu-items.module';
import { SpaceMenusModule } from './features/space-menus/space-menus.module';
import { IngredientsModule } from './features/ingredients/ingredients.module';
import { PackagingModule } from './features/packaging/packaging.module';
import { EventsModule } from './features/events/events.module';
import { AnalyseModule } from './features/analyse/analyse.module';
import { MappingsModule } from './features/mappings/mappings.module';
import { AggregationModule } from './features/aggregation/aggregation.module';
import { AuditModule } from './core/audit/audit.module';
import { WebhooksModule } from './core/webhooks/webhooks.module';
import { TenantThrottlerGuard } from './core/throttle/tenant-throttler.guard';
import { REDIS_CLIENT } from './core/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Charge le fichier d'env spécifique à l'environnement, avec fallback en cascade.
      // En production/staging/conteneur, on s'appuie aussi sur process.env injecté par l'orchestrateur.
      envFilePath: [
        `envFiles/.env.${process.env.NODE_ENV || 'development'}`,
        'envFiles/.env',
        '.env',
      ],
      expandVariables: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'staging', 'production', 'test')
          .default('development'),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        PORT: Joi.number().default(3000),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redisClient: Redis) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 20 },   // 20 req/s per tenant
          { name: 'medium', ttl: 60000, limit: 300 }, // 300 req/min per tenant
          { name: 'long', ttl: 3600000, limit: 5000 }, // 5000 req/h per tenant
        ],
        storage: new ThrottlerStorageRedisService(redisClient),
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
            : undefined,
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-api-key"]',
        ],
        customProps: (req: any) => ({
          tenantId: req.user?.tenantId ?? undefined,
          userId: req.user?.id ?? undefined,
        }),
      },
    }),
    ScheduleModule.forRoot(),
    EncryptionModule,
    CacheModule,
    RedisModule.forRoot(),
    QueueModule,
    PrismaModule,
    AuditModule,
    WebhooksModule,
    AuthModule,
    HealthModule,
    OnboardingModule,
    OrganizationsModule,
    IntegrationsModule,
    WeezeventModule,
    MeModule,
    TenantsModule,
    SpacesModule,
    UsersModule,
    OrchestratorModule,
    SuppliersModule,
    MarketPricesModule,
    MenuComponentsModule,
    MenuItemsModule,
    SpaceMenusModule,
    IngredientsModule,
    PackagingModule,
    EventsModule,
    AnalyseModule,
    MappingsModule,
    AggregationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
  ],
})
export class AppModule { }
