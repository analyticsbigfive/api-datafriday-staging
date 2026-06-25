import { Module } from '@nestjs/common';
import { RouterModule, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ClsModule } from 'nestjs-cls';
import * as Joi from 'joi';
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
import { RolesModule } from './features/roles/roles.module';
import { PermissionsModule } from './features/permissions/permissions.module';
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
import { BrandsModule } from './features/brands/brands.module';
import { DisplayNamesModule } from './features/display-names/display-names.module';
import { InventoryModule } from './features/inventory/inventory.module';
import { RestockStateModule } from './features/restock-state/restock-state.module';
import { AuditModule } from './core/audit/audit.module';
import { WebhooksModule } from './core/webhooks/webhooks.module';
import { TenantThrottlerGuard } from './core/throttle/tenant-throttler.guard';
import { JwtDatabaseGuard } from './core/auth/guards/jwt-db.guard';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { PermissionsGuard } from './core/auth/guards/permissions.guard';
import { SpaceAccessGuard } from './core/auth/guards/space-access.guard';
import { SpaceAccessModule } from './core/auth/space-access.module';
import { TenantGuard } from './core/auth/guards/tenant.guard';
import { SupabaseModule } from './core/supabase/supabase.module';
import { TenantModule } from './core/tenant/tenant.module';
import { TenantContextInterceptor } from './core/tenant/tenant-context.interceptor';

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
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },   // 20 req/s per tenant
      { name: 'medium', ttl: 60000, limit: 300 }, // 300 req/min per tenant
      { name: 'long', ttl: 3600000, limit: 5000 }, // 5000 req/h per tenant
    ]),
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
    // Request-scoped context (AsyncLocalStorage) — carries tenantId for
    // automatic Prisma tenant scoping. Mounted as middleware so it wraps the
    // whole request (guards, interceptors, handlers).
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    EncryptionModule,
    CacheModule,
    SupabaseModule,
    TenantModule,
    SpaceAccessModule,
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
    RolesModule,
    PermissionsModule,
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
    BrandsModule,
    DisplayNamesModule,
    InventoryModule,
    RestockStateModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global interceptor: pushes the authenticated tenantId into CLS so Prisma
    // auto-scopes queries. Runs after guards (request.user populated).
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // --- Global guards (executed in registration order) ---
    // 1. Rate limiting (per tenant)
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    // 2. Authentication — populates request.user (skips @Public())
    { provide: APP_GUARD, useClass: JwtDatabaseGuard },
    // 3. Tenant context — fail closed if no tenant (skips @Public()/@AllowNoTenant())
    { provide: APP_GUARD, useClass: TenantGuard },
    // 4. Coarse RBAC — enforces @Roles()
    { provide: APP_GUARD, useClass: RolesGuard },
    // 5. Fine-grained RBAC — enforces @RequirePermissions()
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // 6. Space-scoped access — STAFF/VIEWER limités à leurs espaces accordés
    { provide: APP_GUARD, useClass: SpaceAccessGuard },
  ],
})
export class AppModule { }
