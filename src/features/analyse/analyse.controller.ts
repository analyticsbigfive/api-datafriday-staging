import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { AnalyseService } from './analyse.service';

@ApiTags('Analyse')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('analyse')
export class AnalyseController {
  constructor(private readonly analyseService: AnalyseService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Tableau de bord analytique global',
    description: 'Retourne les KPIs agrégés du tenant : chiffre d\'affaires total, nombre d\'événements, coût total, marge moyenne et top articles.',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs agrégés du dashboard',
    schema: {
      type: 'object',
      properties: {
        totalRevenue: { type: 'number', example: 12500.50 },
        totalEvents: { type: 'number', example: 8 },
        totalCost: { type: 'number', example: 4800.25 },
        averageMargin: { type: 'number', example: 61.6, description: 'Marge moyenne en %' },
        topMenuItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              revenue: { type: 'number' },
              quantity: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getDashboard(@Req() req) {
    return this.analyseService.getDashboard(req.user.tenantId);
  }

  @Get('kpis/menu')
  @ApiOperation({
    summary: 'KPIs par article de menu',
    description: 'Retourne les indicateurs de performance par article de menu : ventes, coût, marge, quantité vendue.',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs par article de menu',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          menuItemId: { type: 'string' },
          menuItemName: { type: 'string' },
          totalRevenue: { type: 'number' },
          totalCost: { type: 'number' },
          margin: { type: 'number', description: 'Marge en %' },
          quantitySold: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getMenuKpis(@Req() req) {
    return this.analyseService.getMenuKpis(req.user.tenantId);
  }

  @Get('kpis/events')
  @ApiOperation({
    summary: 'KPIs par événement',
    description: 'Retourne les indicateurs de performance par événement : revenus, coûts, marge, articles les plus vendus.',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs par événement',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          eventName: { type: 'string' },
          eventDate: { type: 'string', format: 'date-time' },
          totalRevenue: { type: 'number' },
          totalCost: { type: 'number' },
          margin: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getEventKpis(@Req() req) {
    return this.analyseService.getEventKpis(req.user.tenantId);
  }

  @Get('timeline/:eventId')
  @ApiOperation({
    summary: 'Timeline minute par minute d\'un événement (via WeezeventEvent.id)',
    description:
      'Agrège les ventes par minute × merchant × article. eventId = WeezeventEvent.id. ' +
      'Paramètres optionnels : startTime/endTime (HH:MM), shopId (merchantId), menuItemId, limit (défaut 1000, max 5000).',
  })
  @ApiParam({ name: 'eventId', description: 'WeezeventEvent.id' })
  @ApiQuery({ name: 'startTime', required: false, description: 'Heure de début HH:MM' })
  @ApiQuery({ name: 'endTime', required: false, description: 'Heure de fin HH:MM' })
  @ApiQuery({ name: 'shopId', required: false, description: 'Filtrer par merchantId Weezevent' })
  @ApiQuery({ name: 'menuItemId', required: false, description: 'Filtrer par menuItemId mappé' })
  @ApiQuery({ name: 'limit', required: false, description: 'Nombre max de lignes (défaut 1000, max 5000)' })
  @ApiResponse({
    status: 200,
    description: 'Enregistrements timeline',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          shopId: { type: 'string', nullable: true },
          shopName: { type: 'string', nullable: true },
          menuItemId: { type: 'string', nullable: true },
          menuItemName: { type: 'string', nullable: true },
          hour: { type: 'number' },
          minute: { type: 'string', example: '19:42' },
          quantity: { type: 'integer' },
          transactionCount: { type: 'integer' },
          revenue: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getTimeline(
    @Param('eventId') eventId: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('shopId') shopId?: string,
    @Query('menuItemId') menuItemId?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    return this.analyseService.getTimeline(eventId, req.user.tenantId, {
      startTime,
      endTime,
      shopId,
      menuItemId,
      limit: limit ? Math.min(parseInt(limit, 10), 5000) : undefined,
    });
  }

  @Get('cost-breakdown')
  @ApiOperation({
    summary: 'Ventilation des coûts',
    description: 'Retourne la décomposition des coûts par catégorie (ingrédients, packaging, composants) et par article de menu.',
  })
  @ApiResponse({
    status: 200,
    description: 'Ventilation des coûts et marges par article',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          menuItemId: { type: 'string' },
          menuItemName: { type: 'string' },
          ingredientsCost: { type: 'number' },
          packagingCost: { type: 'number' },
          componentsCost: { type: 'number' },
          totalCost: { type: 'number' },
          basePrice: { type: 'number' },
          margin: { type: 'number' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getCostBreakdown(@Req() req) {
    return this.analyseService.getCostBreakdown(req.user.tenantId);
  }
}
