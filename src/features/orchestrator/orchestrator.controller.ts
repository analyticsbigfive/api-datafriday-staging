import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { OrchestratorService } from './orchestrator.service';
import { JwtGuard } from '../../core/auth/guards/jwt.guard';
import { InvalidateCacheDto } from './dto/invalidate-cache.dto';
import { GetStrategyQueryDto } from './dto/get-strategy-query.dto';

@ApiTags('Orchestrator')
@ApiBearerAuth('supabase-jwt')
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
  @ApiBody({ type: InvalidateCacheDto })
  @ApiResponse({ status: 200, description: 'Cache invalidated successfully' })
  async invalidateCache(
    @Body() body: InvalidateCacheDto,
  ) {
    await this.orchestratorService.invalidateCache(body.tenantId, body.spaceId);
    return { success: true, message: 'Cache invalidated' };
  }

  @Get('strategy')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Get recommended processing strategy for a context' })
  @ApiQuery({ name: 'tenantId', required: true, type: String })
  @ApiQuery({ name: 'operation', required: true, type: String })
  @ApiQuery({ name: 'estimatedItems', required: false, type: Number })
  @ApiQuery({ name: 'priority', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Processing strategy recommendation' })
  getStrategy(@Query() query: GetStrategyQueryDto) {
    return this.orchestratorService.decideStrategy({
      tenantId: query.tenantId,
      operation: query.operation,
      estimatedItems: query.estimatedItems,
      priority: query.priority,
    });
  }
}
