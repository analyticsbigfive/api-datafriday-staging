import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface JwtPayload {
  sub: string; // userId Supabase
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
  // ⚠️ Plus besoin de org_id dans le token !
}

/**
 * JWT Strategy avec lookup DB pour récupérer le tenantId
 * ✅ Plus robuste : source de vérité = DB
 * ✅ Pas besoin de modifier le token Supabase
 * ⚠️ 1 requête DB par authentification (mise en cache recommandée)
 */
@Injectable()
export class JwtDatabaseStrategy extends PassportStrategy(Strategy, 'jwt-db') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  /**
   * Valide le token et récupère les infos user + tenant depuis la DB
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    // 🔍 Lookup dans la DB pour récupérer user + tenant
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found in database');
    }

    // Vérifier si le tenant est actif
    if (user.tenant.status === 'SUSPENDED') {
      throw new UnauthorizedException('Organization is suspended');
    }

    // 🎯 Retourner les infos complètes
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
    };
  }
}
