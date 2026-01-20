import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { OrchestratorService } from './orchestrator.service';
import { JwtGuard } from '../../core/auth/guards/jwt.guard';

@ApiTags('Orchestrator')
@ApiBearerAuth()
@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check health of all processing backends' })
  @ApiResponse({ status: 200, description: 'Health status of Redis, queues, and edge functions' })
  async healthCheck() {
    return this.orchestratorService.healthCheck();
  }

  @Post('invalidate-cache')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Invalidate cache for a tenant' })
  @ApiResponse({ status: 200, description: 'Cache invalidated successfully' })
  async invalidateCache(
    @Body() body: { tenantId: string; spaceId?: string },
  ) {
    await this.orchestratorService.invalidateCache(body.tenantId, body.spaceId);
    return { success: true, message: 'Cache invalidated' };
  }

  @Get('strategy')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Get recommended processing strategy for a context' })
  @ApiResponse({ status: 200, description: 'Processing strategy recommendation' })
  getStrategy(
    @Query('tenantId') tenantId: string,
    @Query('operation') operation: 'sync' | 'analytics' | 'export' | 'report',
    @Query('estimatedItems') estimatedItems?: string,
    @Query('priority') priority?: 'high' | 'normal' | 'low',
  ) {
    return this.orchestratorService.decideStrategy({
      tenantId,
      operation,
      estimatedItems: estimatedItems ? parseInt(estimatedItems, 10) : undefined,
      priority,
    });
  }
}
