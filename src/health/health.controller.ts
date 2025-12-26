import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../core/auth/guards/jwt.guard';
import { RolesGuard } from '../core/auth/guards/roles.guard';
import { Roles } from '../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../core/auth/decorators/current-tenant.decorator';
import { UserRole } from '@prisma/client';

/**
 * Health check controller to validate infrastructure is working
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  /**
   * Public health check endpoint
   */
  @Get()
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
        message: { type: 'string', example: 'API is running' },
        timestamp: { type: 'string', example: '2025-01-01T00:00:00.000Z' },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  check() {
    return {
      status: 'ok',
      message: 'API is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      phase: 'Phase 1 Complete - Core Infrastructure',
    };
  }

  /**
   * Protected endpoint - requires JWT authentication
   */
  @Get('protected')
  @UseGuards(JwtGuard)
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
  @UseGuards(JwtGuard, RolesGuard)
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
