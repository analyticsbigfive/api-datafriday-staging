import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  org_id: string; // tenantId
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT Strategy for validating Supabase JWT tokens
 * Extracts user information and tenant context from token
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Validate JWT payload and return user object
   * This user object will be attached to request.user
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.org_id) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      id: payload.sub,
      email: payload.email,
      tenantId: payload.org_id,
      role: payload.role,
    };
  }
}
