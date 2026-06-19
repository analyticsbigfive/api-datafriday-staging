import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { buildJwtVerifyOptions } from '../jwt-secret.provider';

export interface JwtPayload {
  sub: string; // userId Supabase
  email: string;
  role?: string;
  org_id?: string; // Legacy Supabase claim — kept for backward compat with onboarding flow
  iat?: number;
  exp?: number;
}

/**
 * JWT Strategy avec lookup DB pour récupérer le tenantId
 * ✅ Plus robuste : source de vérité = DB
 * ✅ Pas besoin de modifier le token Supabase
 * ⚠️ 1 requête DB par authentification (mise en cache recommandée)
 */
@Injectable()
export class JwtDatabaseStrategy extends PassportStrategy(Strategy, 'jwt-db') {
  private readonly AUTH_CACHE_TTL = 300; // 5 minutes (was 60s — user/tenant data rarely changes)
  private readonly LOCAL_AUTH_CACHE_TTL_MS = 15_000;
  private readonly localCache = new Map<string, { user: any; expiresAt: number }>();
  private readonly pendingLookups = new Map<string, Promise<any>>();
  
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    super(buildJwtVerifyOptions(configService));
  }

  /**
   * Valide le token et récupère les infos user + tenant depuis la DB
   * P1: Avec cache Redis (TTL 60s) pour réduire charge DB
   */
  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    const cacheKey = `auth:user:${payload.sub}`;
    const localCachedUser = this.getLocalCachedUser(cacheKey);

    if (localCachedUser) {
      if (localCachedUser.tenant && localCachedUser.tenant.status === 'SUSPENDED') {
        throw new UnauthorizedException('Organization is suspended');
      }
      return localCachedUser;
    }

    // P1: Check cache first
    const cachedUser = await this.redis.get<any>(cacheKey);
    
    if (cachedUser) {
      this.setLocalCachedUser(cacheKey, cachedUser);
      // Vérifier si le tenant est actif (seulement si l'user a un tenant)
      if (cachedUser.tenant && cachedUser.tenant.status === 'SUSPENDED') {
        throw new UnauthorizedException('Organization is suspended');
      }
      return cachedUser;
    }

    // Same-process deduplication: reuse in-flight promise for the same key.
    const pendingLookup = this.pendingLookups.get(cacheKey);
    if (pendingLookup) {
      return pendingLookup;
    }

    // Cross-process deduplication: use a distributed Redis lock.
    const lookupPromise = this.lookupWithDistributedLock(cacheKey, payload);
    this.pendingLookups.set(cacheKey, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      this.pendingLookups.delete(cacheKey);
    }
  }

  private getLocalCachedUser(cacheKey: string) {
    const cached = this.localCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.localCache.delete(cacheKey);
      return null;
    }

    return cached.user;
  }

  private setLocalCachedUser(cacheKey: string, user: any) {
    this.localCache.set(cacheKey, {
      user,
      expiresAt: Date.now() + this.LOCAL_AUTH_CACHE_TTL_MS,
    });
  }

  /**
   * Acquires a short-lived Redis lock to prevent cache stampede across multiple
   * pods/workers. Falls back to a retry-from-cache pattern if the lock is held.
   */
  private async lookupWithDistributedLock(cacheKey: string, payload: JwtPayload): Promise<any> {
    const lockValue = randomUUID();
    const acquired = await this.redis.acquireLock(cacheKey, lockValue, 5);

    if (acquired) {
      try {
        return await this.lookupAndCacheUser(cacheKey, payload);
      } finally {
        await this.redis.releaseLock(cacheKey, lockValue);
      }
    }

    // Lock held by another pod — wait briefly and retry from cache.
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    const freshCache = await this.redis.get<any>(cacheKey);
    if (freshCache) {
      this.setLocalCachedUser(cacheKey, freshCache);
      return freshCache;
    }

    // Very rare case (e.g. lock expired before DB write): fall through to DB.
    return this.lookupAndCacheUser(cacheKey, payload);
  }

  private async lookupAndCacheUser(cacheKey: string, payload: JwtPayload) {
    // Cache MISS: Lookup dans la DB pour récupérer user + tenant + rôle/permissions RBAC
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        fullName: true,
        role: true, // legacy enum, conservé en fallback
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
          },
        },
        roleRef: {
          select: {
            id: true,
            name: true,
            systemKey: true,
            isSystem: true,
            permissions: {
              select: { permission: { select: { code: true } } },
            },
          },
        },
        userTenants: {
          select: { tenantId: true, isOwner: true },
        },
      },
    });

    if (!user) {
      const anonymousUser = {
        id: payload.sub,
        email: payload.email,
        firstName: null,
        lastName: null,
        fullName: null,
        tenantId: null,
        tenant: null,
        role: {
          id: null,
          name: null,
          systemKey: null,
          isSystem: true,
          permissions: [],
        },
        isOwner: false,
      };

      this.setLocalCachedUser(cacheKey, anonymousUser);
      await this.redis.set(cacheKey, anonymousUser, { ttl: this.AUTH_CACHE_TTL });

      return anonymousUser;
    }

    if (user.tenant && user.tenant.status === 'SUSPENDED') {
      throw new UnauthorizedException('Organization is suspended');
    }

    const userTenant = user.userTenants.find((ut) => ut.tenantId === user.tenantId);

    const userPayload = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      tenantId: user.tenantId,
      tenant: user.tenant,
      role: {
        id: user.roleRef?.id ?? null,
        name: user.roleRef?.name ?? user.role,
        systemKey: user.roleRef?.systemKey ?? user.role, // fallback legacy
        isSystem: user.roleRef?.isSystem ?? true,
        permissions: user.roleRef?.permissions.map((rp) => rp.permission.code) ?? [],
      },
      isOwner: userTenant?.isOwner ?? false,
    };

    this.setLocalCachedUser(cacheKey, userPayload);
    await this.redis.set(cacheKey, userPayload, { ttl: this.AUTH_CACHE_TTL });

    return userPayload;
  }

  /**
   * Invalide le cache d'authentification d'un utilisateur (cache local + Redis).
   * À appeler après toute mutation impactant `request.user` (changement de rôle,
   * édition des permissions d'un rôle, transfert de propriété, etc.).
   *
   * Note : le cache local (15s TTL) est par instance/pod — l'invalidation locale
   * ne couvre que le pod courant, mais la fenêtre de staleness reste bornée à 15s.
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const cacheKey = `auth:user:${userId}`;
    this.localCache.delete(cacheKey);
    await this.redis.delete(cacheKey);
  }
}
