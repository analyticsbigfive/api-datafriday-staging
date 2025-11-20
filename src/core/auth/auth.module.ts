import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtOnboardingStrategy } from './strategies/jwt-onboarding.strategy';
import { JwtDatabaseStrategy } from './strategies/jwt-db-lookup.strategy';
import { PrismaModule } from '../database/prisma.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt-db' }), // ✅ Stratégie par défaut
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
    }),
    PrismaModule, // 🔍 Nécessaire pour JwtDatabaseStrategy
  ],
  providers: [
    JwtStrategy,           // Ancienne stratégie (garde pour compatibilité)
    JwtOnboardingStrategy, // Pour onboarding
    JwtDatabaseStrategy,   // ✅ Nouvelle stratégie recommandée
  ],
  exports: [PassportModule, JwtModule],
})
export class AuthModule { }
