import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/database/prisma.module';
import { AuthModule } from './core/auth/auth.module';
import { HealthModule } from './health/health.module';
import { OnboardingModule } from './features/onboarding/onboarding.module';
import { EncryptionModule } from './core/encryption/encryption.module';
import { WeezeventModule } from './features/weezevent/weezevent.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'envFiles/.env.development',
    }),
    EncryptionModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    OnboardingModule,
    WeezeventModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
