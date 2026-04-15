import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { AggregationService } from './aggregation.service';
import { ProcessEventsDto, SynchronizeDto } from './dto/aggregation.dto';

@ApiTags('Aggregation')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('aggregation')
export class AggregationController {
  private readonly logger = new Logger(AggregationController.name);

  constructor(private readonly aggregationService: AggregationService) {}

  @Get('events-timeline/:spaceId')
  @ApiOperation({ summary: 'Obtenir le statut timeline des événements d\'un space' })
  @ApiResponse({ status: 200, description: 'Timeline avec statut de traitement' })
  getEventsTimeline(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getEventsTimelineStatus(user.tenantId, spaceId);
  }

  @Post('process-events')
  @ApiOperation({ summary: 'Traiter les événements pour agrégation des données' })
  @ApiResponse({ status: 201, description: 'Traitement lancé' })
  processEvents(
    @Body() dto: ProcessEventsDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /aggregation/process-events - space=${dto.spaceId}`);
    return this.aggregationService.processEvents(user.tenantId, dto.spaceId, dto.eventIds);
  }

  @Post('synchronize')
  @ApiOperation({ summary: 'Synchroniser et recalculer toutes les données agrégées' })
  @ApiResponse({ status: 201, description: 'Synchronisation lancée' })
  synchronize(
    @Body() dto: SynchronizeDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /aggregation/synchronize - space=${dto.spaceId}`);
    return this.aggregationService.synchronize(user.tenantId, dto.spaceId);
  }

  @Get('progress/:jobId')
  @ApiOperation({ summary: 'Obtenir la progression d\'un job d\'agrégation' })
  @ApiResponse({ status: 200, description: 'Progression du job' })
  getJobProgress(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getJobProgress(user.tenantId, jobId);
  }
}
