import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { SpaceMenusService } from './space-menus.service';
import { SaveSpaceMenuConfigurationDto } from './dto/save-space-menu-configuration.dto';

@ApiTags('Space Menus')
@ApiBearerAuth('supabase-jwt')
@Controller('space-menus')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceMenusController {
  constructor(private readonly spaceMenusService: SpaceMenusService) {}

  @Get(':spaceId/:configId')
  @ApiOperation({ summary: 'Get menu configuration for a space/config' })
  @ApiParam({ name: 'spaceId', description: 'ID de l’espace' })
  @ApiParam({ name: 'configId', description: 'ID de la configuration' })
  @ApiResponse({ status: 200, description: 'Configuration de menu de l’espace' })
  async getMenuConfiguration(
    @Param('spaceId') spaceId: string,
    @Param('configId') configId: string,
  ) {
    return this.spaceMenusService.getMenuConfiguration(spaceId, configId);
  }

  @Post()
  @ApiOperation({ summary: 'Save menu configuration for a space/config' })
  @ApiBody({ type: SaveSpaceMenuConfigurationDto })
  @ApiResponse({ status: 201, description: 'Configuration de menu enregistrée' })
  async saveMenuConfiguration(
    @Body() body: SaveSpaceMenuConfigurationDto,
  ) {
    return this.spaceMenusService.saveMenuConfiguration(body.spaceId, body.configId, body.menuItems);
  }
}
