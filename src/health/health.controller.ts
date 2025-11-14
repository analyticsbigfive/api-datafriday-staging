import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../core/auth/guards/jwt.guard';
import { RolesGuard } from '../core/auth/guards/roles.guard';
import { Roles } from '../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../core/auth/decorators/current-tenant.decorator';
import { UserRole } from '@prisma/client';

/**
 * Health check controller to validate infrastructure is working
 */
@Controller('health')
export class HealthController {
  /**
   * Public health check endpoint
   */
  @Get()
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
