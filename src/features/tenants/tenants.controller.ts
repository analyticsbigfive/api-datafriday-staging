import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { UpgradePlanDto } from './dto/upgrade-plan.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';

@ApiTags('Tenants')
@ApiBearerAuth('supabase-jwt')
@Controller('tenants')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Create a new tenant
   */
  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouveau tenant (admin)',
    description: 'Crée un nouveau tenant. Réservé aux super-admins.',
  })
  @ApiResponse({ status: 201, description: 'Tenant créé' })
  @ApiResponse({ status: 409, description: 'Slug ou domaine déjà utilisé' })
  async create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }

  /**
   * Get all tenants with pagination and filters
   */
  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Lister tous les tenants (admin)',
    description: 'Liste paginée de tous les tenants avec filtres optionnels.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom, slug, email ou ville' })
  @ApiQuery({ name: 'plan', required: false, enum: ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'SUSPENDED', 'TRIAL'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Liste des tenants avec métadonnées de pagination' })
  async findAll(@Query() query: QueryTenantDto) {
    return this.tenantsService.findAll(query);
  }

  /**
   * Get tenant statistics
   */
  @Get('statistics')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Statistiques des tenants (admin)',
    description: 'Retourne les statistiques globales sur les tenants.',
  })
  @ApiResponse({ status: 200, description: 'Statistiques' })
  async getStatistics() {
    return this.tenantsService.getStatistics();
  }

  /**
   * Get tenant by slug
   */
  @Get('by-slug/:slug')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Obtenir un tenant par slug',
  })
  @ApiParam({ name: 'slug', description: 'Identifiant unique du tenant' })
  @ApiResponse({ status: 200, description: 'Détails du tenant' })
  @ApiResponse({ status: 404, description: 'Tenant non trouvé' })
  async findBySlug(@Param('slug') slug: string) {
    return this.tenantsService.findBySlug(slug);
  }

  /**
   * Get tenant by ID
   */
  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Obtenir un tenant par ID',
  })
  @ApiParam({ name: 'id', description: 'ID unique du tenant' })
  @ApiResponse({ status: 200, description: 'Détails du tenant' })
  @ApiResponse({ status: 404, description: 'Tenant non trouvé' })
  async findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  /**
   * Update tenant
   */
  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Mettre à jour un tenant',
  })
  @ApiResponse({ status: 200, description: 'Tenant mis à jour' })
  @ApiResponse({ status: 404, description: 'Tenant non trouvé' })
  async update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  /**
   * Delete tenant (soft delete)
   */
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Supprimer un tenant (soft delete)',
    description: 'Marque le tenant comme supprimé sans effacer les données.',
  })
  @ApiResponse({ status: 200, description: 'Tenant marqué comme supprimé' })
  async remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  /**
   * Hard delete tenant (permanent)
   * DELETE /api/v1/tenants/:id/permanent
   */
  @Delete(':id/permanent')
  @Roles('ADMIN')
  async hardDelete(@Param('id') id: string) {
    return this.tenantsService.hardDelete(id);
  }

  /**
   * Upgrade tenant plan
   * POST /api/v1/tenants/:id/upgrade
   */
  @Post(':id/upgrade')
  @Roles('ADMIN', 'MANAGER')
  async upgradePlan(@Param('id') id: string, @Body() upgradePlanDto: UpgradePlanDto) {
    return this.tenantsService.upgradePlan(id, upgradePlanDto);
  }

  /**
   * Get tenant usage statistics
   * GET /api/v1/tenants/:id/usage
   */
  @Get(':id/usage')
  @Roles('ADMIN', 'MANAGER')
  async getUsage(@Param('id') id: string) {
    return this.tenantsService.getUsage(id);
  }

  /**
   * Suspend tenant
   * POST /api/v1/tenants/:id/suspend
   */
  @Post(':id/suspend')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async suspend(@Param('id') id: string) {
    return this.tenantsService.suspend(id);
  }

  /**
   * Reactivate tenant
   * POST /api/v1/tenants/:id/reactivate
   */
  @Post(':id/reactivate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async reactivate(@Param('id') id: string) {
    return this.tenantsService.reactivate(id);
  }
}
