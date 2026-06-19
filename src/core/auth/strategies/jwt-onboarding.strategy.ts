import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './jwt-db-lookup.strategy';
import { buildJwtVerifyOptions } from '../jwt-secret.provider';

/**
 * JWT Strategy specifically for Onboarding
 * Allows tokens without 'org_id' to access the onboarding endpoint
 */
@Injectable()
export class JwtOnboardingStrategy extends PassportStrategy(Strategy, 'jwt-onboarding') {
  constructor(private configService: ConfigService) {
    super(buildJwtVerifyOptions(configService));
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
