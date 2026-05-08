import { Controller, Get, UseGuards, Inject, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtDatabaseGuard } from '../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../core/auth/guards/roles.guard';
import { Roles } from '../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../core/auth/decorators/current-tenant.decorator';
import { Public } from '../core/auth/decorators/public.decorator';
import { UserRole } from '@prisma/client';
import { RedisService } from '../core/redis/redis.service';
import { QueueService } from '../core/queue/queue.service';
import { PrismaService } from '../core/database/prisma.service';

/**
 * Health check controller to validate infrastructure is working
 */
@SkipThrottle()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional() private readonly redisService: RedisService,
    @Optional() private readonly queueService: QueueService,
    @Optional() private readonly prisma: PrismaService,
  ) {}

  /**
   * Public health check endpoint
   */
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Vérifier le status de l\'API',
    description: 'Endpoint public pour vérifier que l\'API est en ligne.',
  })
  @ApiResponse({
    status: 200,
    description: 'L\'API fonctionne correctement',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2025-01-01T00:00:00.000Z' },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Detailed health check including Redis and Queues
   */
  @Get('detailed')
  @ApiOperation({
    summary: 'Health check détaillé avec Redis et Queues',
    description: 'Vérifie l\'état de tous les services HEOS (informations techniques sensibles).',
  })
  @ApiResponse({ status: 200, description: 'Status détaillé de tous les services' })
  async detailedCheck() {
    const checks: Record<string, any> = {
      api: { status: 'healthy' },
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      architecture: 'HEOS - High Efficiency Orchestration System',
    };

    // Check Database (Prisma)
    if (this.prisma) {
      const start = Date.now();
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        checks.database = {
          status: 'healthy',
          latencyMs: Date.now() - start,
        };
      } catch (error) {
        checks.database = { status: 'unhealthy', error: error.message };
      }
    } else {
      checks.database = { status: 'not_configured' };
    }

    // Check Redis
    if (this.redisService) {
      try {
        const redisOk = await this.redisService.ping();
        checks.redis = {
          status: redisOk ? 'healthy' : 'unhealthy',
          connected: redisOk,
        };
      } catch (error) {
        checks.redis = { status: 'unhealthy', error: error.message };
      }
    } else {
      checks.redis = { status: 'not_configured' };
    }

    // Check Queues
    if (this.queueService) {
      try {
        const queueStats = await this.queueService.getAllQueueStats();
        checks.queues = {
          status: 'healthy',
          stats: queueStats,
        };
      } catch (error) {
        checks.queues = { status: 'unhealthy', error: error.message };
      }
    } else {
      checks.queues = { status: 'not_configured' };
    }

    // Overall status
    const allHealthy = Object.values(checks)
      .filter((c) => typeof c === 'object' && c.status)
      .every((c: any) => c.status === 'healthy' || c.status === 'not_configured');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      services: checks,
    };
  }

  /**
   * Protected endpoint - requires JWT authentication
   */
  @Get('protected')
  @UseGuards(JwtDatabaseGuard)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Test endpoint protégé',
    description: 'Vérifie que l\'authentification JWT fonctionne.',
  })
  @ApiResponse({ status: 200, description: 'Authentification réussie' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  protectedRoute(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    return {
      message: 'Authentication successful!',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      tenantId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Admin-only endpoint - requires JWT + ADMIN role
   */
  @Get('admin')
  @UseGuards(JwtDatabaseGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('supabase-jwt')
  @ApiOperation({
    summary: 'Test endpoint admin',
    description: 'Vérifie que l\'autorisation admin fonctionne.',
  })
  @ApiResponse({ status: 200, description: 'Accès admin autorisé' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès refusé - rôle ADMIN requis' })
  adminRoute(@CurrentUser() user: any) {
    return {
      message: 'Admin access granted!',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
