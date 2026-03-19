import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AnalyseService } from './analyse.service';

@ApiTags('Analyse')
@ApiBearerAuth('supabase-jwt')
@Controller('analyse')
export class AnalyseController {
  constructor(private readonly analyseService: AnalyseService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Obtenir le tableau de bord analytique global' })
  @ApiResponse({ status: 200, description: 'KPIs agrégés du dashboard' })
  getDashboard(@Req() req) {
    return this.analyseService.getDashboard(req.user.tenantId);
  }

  @Get('kpis/menu')
  @ApiOperation({ summary: 'Obtenir les KPIs menu' })
  @ApiResponse({ status: 200, description: 'Indicateurs de performance des articles de menu' })
  getMenuKpis(@Req() req) {
    return this.analyseService.getMenuKpis(req.user.tenantId);
  }

  @Get('kpis/events')
  @ApiOperation({ summary: 'Obtenir les KPIs événements' })
  @ApiResponse({ status: 200, description: 'Indicateurs de performance des événements' })
  getEventKpis(@Req() req) {
    return this.analyseService.getEventKpis(req.user.tenantId);
  }

  @Get('cost-breakdown')
  @ApiOperation({ summary: 'Obtenir la ventilation des coûts' })
  @ApiResponse({ status: 200, description: 'Détail des coûts et marges par article' })
  getCostBreakdown(@Req() req) {
    return this.analyseService.getCostBreakdown(req.user.tenantId);
  }
}
