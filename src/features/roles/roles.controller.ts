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
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Roles')
@ApiBearerAuth('supabase-jwt')
@Controller('roles')
@UseGuards(JwtDatabaseGuard, RolesGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /**
   * List roles for the current tenant
   */
  @Get()
  @ApiOperation({
    summary: 'Lister les rôles',
    description: 'Retourne les rôles du tenant courant avec leurs permissions.',
  })
  @ApiResponse({ status: 200, description: 'Liste des rôles' })
  async findAll(@CurrentTenant() tenantId: string) {
    return this.rolesService.findAll(tenantId);
  }

  /**
   * Get role by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Détail d\'un rôle',
    description: 'Retourne un rôle du tenant courant avec ses permissions.',
  })
  @ApiParam({ name: 'id', description: 'ID du rôle' })
  @ApiResponse({ status: 200, description: 'Détails du rôle' })
  @ApiResponse({ status: 404, description: 'Rôle non trouvé' })
  async findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.rolesService.findOne(id, tenantId);
  }

  /**
   * Create a custom role
   */
  @Post()
  @RequirePermissions('org.roles.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un rôle',
    description: 'Crée un rôle custom pour le tenant courant. Réservé aux admins.',
  })
  @ApiResponse({ status: 201, description: 'Rôle créé' })
  @ApiResponse({ status: 409, description: 'Nom déjà utilisé dans ce tenant' })
  async create(@CurrentTenant() tenantId: string, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(tenantId, dto);
  }

  /**
   * Update a role
   */
  @Patch(':id')
  @RequirePermissions('org.roles.manage')
  @ApiOperation({
    summary: 'Mettre à jour un rôle',
    description:
      'Met à jour un rôle. Pour les rôles système, seuls la description et les permissions sont modifiables.',
  })
  @ApiParam({ name: 'id', description: 'ID du rôle' })
  @ApiResponse({ status: 200, description: 'Rôle mis à jour' })
  @ApiResponse({ status: 400, description: 'Modification non autorisée pour un rôle système' })
  @ApiResponse({ status: 404, description: 'Rôle non trouvé' })
  async update(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, tenantId, dto);
  }

  /**
   * Delete a custom role
   */
  @Delete(':id')
  @RequirePermissions('org.roles.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer un rôle',
    description:
      'Supprime un rôle custom. Les rôles système et les rôles assignés à des utilisateurs ne peuvent pas être supprimés.',
  })
  @ApiParam({ name: 'id', description: 'ID du rôle' })
  @ApiResponse({ status: 200, description: 'Rôle supprimé' })
  @ApiResponse({ status: 400, description: 'Rôle système (non supprimable)' })
  @ApiResponse({ status: 404, description: 'Rôle non trouvé' })
  @ApiResponse({ status: 409, description: 'Rôle assigné à des utilisateurs' })
  async remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.rolesService.remove(id, tenantId);
  }
}
