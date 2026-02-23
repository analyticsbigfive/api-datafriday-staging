import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { SpaceMenusService } from './space-menus.service';

@ApiTags('Space Menus')
@ApiBearerAuth('supabase-jwt')
@Controller('space-menus')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceMenusController {
  constructor(private readonly spaceMenusService: SpaceMenusService) {}

  @Get(':spaceId/:configId')
  @ApiOperation({ summary: 'Get menu configuration for a space/config' })
  async getMenuConfiguration(
    @Param('spaceId') spaceId: string,
    @Param('configId') configId: string,
  ) {
    return this.spaceMenusService.getMenuConfiguration(spaceId, configId);
  }

  @Post()
  @ApiOperation({ summary: 'Save menu configuration for a space/config' })
  async saveMenuConfiguration(
    @Body() body: { spaceId: string; configId: string; menuItems: Record<string, Record<string, boolean>> },
  ) {
    return this.spaceMenusService.saveMenuConfiguration(body.spaceId, body.configId, body.menuItems);
  }
}
