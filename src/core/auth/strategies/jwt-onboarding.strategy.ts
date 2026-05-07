import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './jwt-db-lookup.strategy';

/**
 * JWT Strategy specifically for Onboarding
 * Allows tokens without 'org_id' to access the onboarding endpoint
 */
@Injectable()
export class JwtOnboardingStrategy extends PassportStrategy(Strategy, 'jwt-onboarding') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  /**
   * Validate JWT payload for onboarding
   * Does NOT require org_id
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload: sub missing');
    }

    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.org_id || null, // Optional for onboarding
      role: payload.role,
    };
  }
}
