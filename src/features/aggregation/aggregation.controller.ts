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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { AggregationService } from './aggregation.service';
import { ProcessEventsDto, SynchronizeDto, SkipEventDto } from './dto/aggregation.dto';

@ApiTags('Aggregation')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('aggregation')
export class AggregationController {
  private readonly logger = new Logger(AggregationController.name);

  constructor(private readonly aggregationService: AggregationService) {}

  @Get('events-timeline/:spaceId')
  @ApiOperation({
    summary: 'Timeline des événements d\'un space',
    description: 'Retourne l\'état de traitement (pending/processing/done/error) de chaque événement Weezevent lié à cet espace.',
  })
  @ApiParam({ name: 'spaceId', description: 'ID du space DataFriday' })
  @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent (scope multi-instance)' })
  @ApiResponse({
    status: 200,
    description: 'Liste des événements avec leur statut de traitement',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          eventName: { type: 'string' },
          eventDate: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['pending', 'processing', 'done', 'error'], example: 'done' },
          processedAt: { type: 'string', format: 'date-time', nullable: true },
          error: { type: 'string', nullable: true },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 404, description: 'Space non trouvé' })
  getEventsTimeline(
    @Param('spaceId') spaceId: string,
    @Query('integrationId') integrationId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getEventsTimelineStatus(user.tenantId, spaceId, integrationId);
  }

  @Post('process-events')
  @ApiOperation({
    summary: 'Traiter les événements pour agrégation',
    description: 'Lance le traitement asynchrone des ventes Weezevent pour les événements donnés. Crée ou met à jour les agrégats SpaceRevenueMinuteAgg. Retourne un jobId pour suivre la progression.',
  })
  @ApiBody({ type: ProcessEventsDto })
  @ApiResponse({
    status: 201,
    description: 'Traitement lancé',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'ID à utiliser avec GET /aggregation/progress/:jobId', example: 'job_abc123' },
        status: { type: 'string', example: 'processing' },
        eventCount: { type: 'number', example: 3 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'spaceId ou eventIds invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  processEvents(
    @Body() dto: ProcessEventsDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /aggregation/process-events - space=${dto.spaceId}`);
    return this.aggregationService.processEvents(user.tenantId, dto.spaceId, dto.eventIds, dto.integrationId);
  }

  @Post('synchronize')
  @ApiOperation({
    summary: 'Synchronisation complète des données agrégées',
    description: 'Recalcule tous les agrégats (SpaceRevenueMinuteAgg) pour un espace donné. Plus complet que process-events mais plus long. Retourne un jobId.',
  })
  @ApiBody({ type: SynchronizeDto })
  @ApiResponse({
    status: 201,
    description: 'Synchronisation lancée',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', example: 'job_xyz789' },
        status: { type: 'string', example: 'processing' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'spaceId invalide' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  synchronize(
    @Body() dto: SynchronizeDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /aggregation/synchronize - space=${dto.spaceId}`);
    return this.aggregationService.synchronize(user.tenantId, dto.spaceId, dto.integrationId);
  }

  @Post('skip-event')
  @ApiOperation({
    summary: 'Ignorer un événement',
    description: 'Marque un événement comme ignoré (skipped) — pas de données disponibles ou exclusion volontaire. Compte comme "traité" pour la condition de passage au step suivant.',
  })
  @ApiBody({ type: SkipEventDto })
  @ApiResponse({
    status: 201,
    description: 'Événement ignoré',
    schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string' },
        status: { type: 'string', example: 'skipped' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  skipEvent(
    @Body() dto: SkipEventDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /aggregation/skip-event - space=${dto.spaceId} event=${dto.eventId}`);
    return this.aggregationService.skipEvent(user.tenantId, dto.spaceId, dto.eventId);
  }

  @Get('progress/:jobId')
  @ApiOperation({
    summary: 'Progression d\'un job d\'agrégation',
    description: 'Interroge l\'état d\'avancement d\'un job lancé par process-events ou synchronize.',
  })
  @ApiParam({ name: 'jobId', description: 'ID du job retourné par process-events ou synchronize' })
  @ApiResponse({
    status: 200,
    description: 'Progression du job',
    schema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'processing', 'done', 'error'] },
        progress: { type: 'number', example: 75, description: 'Pourcentage d\'avancement (0-100)' },
        processedCount: { type: 'number', example: 3 },
        totalCount: { type: 'number', example: 4 },
        error: { type: 'string', nullable: true },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Job non trouvé' })
  getJobProgress(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getJobProgress(user.tenantId, jobId);
  }

  @Get('event-breakdown/:spaceId/:eventId')
  @ApiOperation({
    summary: 'Détail par shops et articles pour un événement',
    description: 'Retourne la décomposition du CA par point de vente (shops) et par article (products) pour un événement précis.',
  })
  @ApiParam({ name: 'spaceId', description: 'ID du space DataFriday' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement DataFriday' })
  @ApiResponse({ status: 200, description: 'Breakdown shops + articles' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  getEventBreakdown(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getEventBreakdown(user.tenantId, spaceId, eventId);
  }

  @Get('event-stats/:spaceId/:eventId')
  @ApiOperation({
    summary: 'Statistiques agrégées d\'un événement',
    description: 'Retourne les totaux (CA HT, nb transactions, nb articles, nb shops) pour un événement.',
  })
  @ApiParam({ name: 'spaceId', description: 'ID du space DataFriday' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement DataFriday' })
  @ApiResponse({ status: 200, description: 'Statistiques de l\'événement' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  getEventStats(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getEventStats(user.tenantId, spaceId, eventId);
  }

  @Get('step4-context/:spaceId')
  @ApiOperation({
    summary: 'Contexte complet pour le step 4 du wizard',
    description: 'Répond en un seul appel : timeline des événements, événements Weezevent synchro’s et indicateur de mappings. Réduit les 7 appels séparés du mounted() en 1.',
  })
  @ApiParam({ name: 'spaceId', description: 'ID du space DataFriday' })
  @ApiQuery({ name: 'integrationId', required: false, description: 'ID de l\'intégration Weezevent' })
  @ApiResponse({ status: 200, description: 'Timeline + weezeventEvents + hasMappings' })
  getStep4Context(
    @Param('spaceId') spaceId: string,
    @Query('integrationId') integrationId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getStep4Context(user.tenantId, spaceId, integrationId);
  }

  @Get('event-minute-chart/:spaceId/:eventId')
  @ApiOperation({
    summary: 'CA par minute pour un événement',
    description: 'Retourne le chiffre d\'affaires minute par minute pour un événement. Alimente l\'onglet "CA / minute" dans le détail event. Source : SpaceRevenueMinuteAgg.',
  })
  @ApiParam({ name: 'spaceId', description: 'ID du space DataFriday' })
  @ApiParam({ name: 'eventId', description: "ID de l'événement DataFriday" })
  @ApiResponse({ status: 200, description: 'Série temporelle minute par minute' })
  @ApiResponse({ status: 404, description: 'Événement non trouvé' })
  getEventMinuteChart(
    @Param('spaceId') spaceId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.aggregationService.getEventMinuteChart(user.tenantId, spaceId, eventId);
  }
}
