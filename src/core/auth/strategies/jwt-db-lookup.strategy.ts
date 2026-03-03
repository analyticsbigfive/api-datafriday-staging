import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';

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
  private readonly AUTH_CACHE_TTL = 60; // 60 seconds
  
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  /**
   * Valide le token et récupère les infos user + tenant depuis la DB
   * P1: Avec cache Redis (TTL 60s) pour réduire charge DB
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    // P1: Check cache first
    const cacheKey = `auth:user:${payload.sub}`;
    const cachedUser = await this.redis.get<any>(cacheKey);
    
    if (cachedUser) {
      // Vérifier si le tenant est actif (seulement si l'user a un tenant)
      if (cachedUser.tenant && cachedUser.tenant.status === 'SUSPENDED') {
        throw new UnauthorizedException('Organization is suspended');
      }
      return cachedUser;
    }

    // Cache MISS: Lookup dans la DB pour récupérer user + tenant
    let user = await this.prisma.user.findUnique({
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
      // User authentifié Supabase mais pas encore en DB (onboarding non complété)
      // On retourne un user partiel depuis le JWT — les endpoints nécessitant un tenant
      // retourneront une erreur métier appropriée (403/404), pas un 401 cryptique
      return {
        id: payload.sub,
        email: payload.email,
        firstName: null,
        fullName: null,
        role: null,
        tenantId: null,
        tenant: null,
      };
    }

    // Vérifier si le tenant est actif (seulement si l'user a un tenant)
    if (user.tenant && user.tenant.status === 'SUSPENDED') {
      throw new UnauthorizedException('Organization is suspended');
    }

    // 🎯 Retourner les infos complètes
    const userPayload = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      fullName: (user as any).fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenant: user.tenant,
    };
    
    // P1: Cache for 60 seconds
    await this.redis.set(cacheKey, userPayload, { ttl: this.AUTH_CACHE_TTL });
    
    return userPayload;
  }
}
