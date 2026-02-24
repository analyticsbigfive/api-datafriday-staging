import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyseService } from './analyse.service';

@ApiTags('Analyse')
@ApiBearerAuth()
@Controller('analyse')
export class AnalyseController {
  constructor(private readonly analyseService: AnalyseService) {}

  @Get('dashboard')
  getDashboard(@Req() req) {
    return this.analyseService.getDashboard(req.user.tenantId);
  }

  @Get('kpis/menu')
  getMenuKpis(@Req() req) {
    return this.analyseService.getMenuKpis(req.user.tenantId);
  }

  @Get('kpis/events')
  getEventKpis(@Req() req) {
    return this.analyseService.getEventKpis(req.user.tenantId);
  }

  @Get('cost-breakdown')
  getCostBreakdown(@Req() req) {
    return this.analyseService.getCostBreakdown(req.user.tenantId);
  }
}
