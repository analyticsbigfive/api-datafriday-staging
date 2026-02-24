import { Module } from '@nestjs/common';
import { RouterModule, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
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
import { AuditModule } from './core/audit/audit.module';
import { WebhooksModule } from './core/webhooks/webhooks.module';
import { TenantThrottlerGuard } from './core/throttle/tenant-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'envFiles/.env.development',
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },   // 20 req/s per tenant
      { name: 'medium', ttl: 60000, limit: 300 }, // 300 req/min per tenant
      { name: 'long', ttl: 3600000, limit: 5000 }, // 5000 req/h per tenant
    ]),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
  ],
})
export class AppModule { }
