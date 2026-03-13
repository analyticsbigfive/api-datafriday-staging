import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtGuard } from '../../core/auth/guards/jwt.guard';
import { SpaceDashboardService } from './services/space-dashboard.service';
import { SpaceAggregationService } from './services/space-aggregation.service';
import {
  DashboardQueryDto,
  DashboardResponseDto,
  DashboardHealthResponseDto,
  AggregationStatus,
} from './dto';

@Controller('api/v1/spaces/:spaceId/dashboard')
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: SpaceDashboardService,
    private readonly aggregationService: SpaceAggregationService,
  ) {}

  @Get()
  async getDashboard(
    @Param('spaceId') spaceId: string,
    @Query() query: DashboardQueryDto,
    @Request() req: any,
  ): Promise<DashboardResponseDto> {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getDashboard(spaceId, tenantId, query);
  }

  @Get('health')
  async getHealth(
    @Param('spaceId') spaceId: string,
    @Request() req: any,
  ): Promise<DashboardHealthResponseDto> {
    const tenantId = req.user.tenantId;
    const health = await this.aggregationService.getAggregationHealth(spaceId, tenantId);
    
    return {
      ...health,
      lastAggregationAt: health.lastAggregationAt?.toISOString() || null,
      aggregationStatus: health.aggregationStatus as AggregationStatus,
    };
  }

  @Post('invalidate')
  @HttpCode(HttpStatus.OK)
  async invalidateCache(
    @Param('spaceId') spaceId: string,
    @Request() req: any,
  ): Promise<{ invalidated: boolean; cacheKeys: number }> {
    const tenantId = req.user.tenantId;
    const keysInvalidated = await this.dashboardService.invalidateCache(
      spaceId,
      tenantId,
    );

    return {
      invalidated: true,
      cacheKeys: keysInvalidated,
    };
  }

  @Post('rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  async rebuildAggregates(
    @Param('spaceId') spaceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ): Promise<{ message: string; jobId: string }> {
    const tenantId = req.user.tenantId;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    await this.aggregationService.runAggregation({
      tenantId,
      spaceId,
      fromDate,
      toDate,
      jobType: 'rebuild',
    });

    await this.dashboardService.incrementVersion(spaceId, tenantId);
    await this.dashboardService.invalidateCache(spaceId, tenantId);

    return {
      message: 'Aggregation rebuild started',
      jobId: 'sync',
    };
  }
}
