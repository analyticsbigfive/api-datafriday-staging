import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/database/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { HealthModule } from './health/health.module';
import { OnboardingModule } from './features/onboarding/onboarding.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { CacheModule } from './core/cache/cache.module';
import { WeezeventModule } from './features/weezevent/weezevent.module';
import { OrganizationsModule } from './features/organizations/organizations.module';
import { IntegrationsModule } from './features/integrations/integrations.module';
import { MeModule } from './features/me/me.module';
import { TenantsModule } from './features/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'envFiles/.env.development',
    }),
    EncryptionModule,
    CacheModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    OnboardingModule,
    OrganizationsModule,
    IntegrationsModule,
    WeezeventModule,
    MeModule,
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
