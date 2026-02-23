import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { MenuComponentsService } from './menu-components.service';
import { CreateMenuComponentDto } from './dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from './dto/update-menu-component.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Menu Components')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('menu-components')
export class MenuComponentsController {
  private readonly logger = new Logger(MenuComponentsController.name);

  constructor(private readonly menuComponentsService: MenuComponentsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un composant de menu' })
  @ApiResponse({ status: 201, description: 'Composant créé' })
  create(@Body() dto: CreateMenuComponentDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-components - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuComponentsService.create(dto, tenantId);
  }

  @Post('repair')
  @ApiOperation({ summary: 'Réparer les composants de menu' })
  @ApiResponse({ status: 200, description: 'Composants réparés' })
  repair(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-components/repair - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuComponentsService.repair(tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les composants de menu' })
  @ApiResponse({ status: 200, description: 'Liste des composants' })
  findAll(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /menu-components - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuComponentsService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un composant par ID' })
  @ApiResponse({ status: 200, description: 'Détails du composant' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /menu-components/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuComponentsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un composant' })
  @ApiResponse({ status: 200, description: 'Composant mis à jour' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuComponentDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`PATCH /menu-components/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuComponentsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un composant' })
  @ApiResponse({ status: 200, description: 'Composant supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /menu-components/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuComponentsService.remove(id, tenantId);
  }
}
