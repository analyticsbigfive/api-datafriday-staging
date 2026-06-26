import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Permissions')
@ApiBearerAuth('supabase-jwt')
@Controller('permissions')
@UseGuards(JwtDatabaseGuard, RolesGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /**
   * List permissions (system catalog + tenant custom permissions)
   */
  @Get()
  @ApiOperation({
    summary: 'Lister les permissions',
    description:
      'Retourne le catalogue système (partagé) et les permissions custom du tenant courant, triées par catégorie.',
  })
  @ApiResponse({ status: 200, description: 'Liste des permissions' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.permissionsService.findAll(tenantId);
  }

  /**
   * Create a custom permission
   */
  @Post()
  @RequirePermissions('org.permissions.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer une permission custom',
    description: 'Crée une permission spécifique au tenant. Réservé aux admins.',
  })
  @ApiResponse({ status: 201, description: 'Permission créée' })
  @ApiResponse({ status: 409, description: 'Code déjà utilisé dans ce tenant' })
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(tenantId, dto);
  }

  /**
   * Update a custom permission
   */
  @Patch(':id')
  @RequirePermissions('org.permissions.manage')
  @ApiOperation({
    summary: 'Mettre à jour une permission',
    description: 'Met à jour une permission custom du tenant. Le catalogue système est en lecture seule.',
  })
  @ApiParam({ name: 'id', description: 'ID de la permission' })
  @ApiResponse({ status: 200, description: 'Permission mise à jour' })
  @ApiResponse({ status: 403, description: 'Permission système (lecture seule)' })
  @ApiResponse({ status: 404, description: 'Permission non trouvée' })
  async update(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.permissionsService.update(id, tenantId, dto);
  }

  /**
   * Delete a custom permission
   */
  @Delete(':id')
  @RequirePermissions('org.permissions.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer une permission',
    description:
      'Supprime une permission custom du tenant (et ses associations RolePermission). Le catalogue système est protégé.',
  })
  @ApiParam({ name: 'id', description: 'ID de la permission' })
  @ApiResponse({ status: 200, description: 'Permission supprimée' })
  @ApiResponse({ status: 403, description: 'Permission système (non supprimable)' })
  @ApiResponse({ status: 404, description: 'Permission non trouvée' })
  async remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.permissionsService.remove(id, tenantId);
  }
}
