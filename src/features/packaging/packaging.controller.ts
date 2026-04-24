import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { PackagingService } from './packaging.service';
import { CreatePackagingDto } from './dto/create-packaging.dto';

@ApiTags('Packaging')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('packaging')
export class PackagingController {
  private readonly logger = new Logger(PackagingController.name);

  constructor(private readonly packagingService: PackagingService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un packaging' })
  @ApiResponse({ status: 201, description: 'Packaging créé' })
  create(@Body() dto: CreatePackagingDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /packaging - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.packagingService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les packagings' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d’éléments par page' })
  @ApiResponse({ status: 200, description: 'Liste des packagings' })
  findAll(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`GET /packaging - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.packagingService.findAll(tenantId, page ? +page : 1, limit ? +limit : 100);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un packaging par ID' })
  @ApiParam({ name: 'id', description: 'ID du packaging' })
  @ApiResponse({ status: 200, description: 'Détails du packaging avec marketPrice associé' })
  @ApiResponse({ status: 404, description: 'Packaging non trouvé' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.packagingService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un packaging' })
  @ApiParam({ name: 'id', description: 'ID du packaging' })
  @ApiResponse({ status: 200, description: 'Packaging mis à jour' })
  @ApiResponse({ status: 404, description: 'Packaging non trouvé' })
  update(@Param('id') id: string, @Body() dto: Partial<CreatePackagingDto>, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.packagingService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un packaging' })
  @ApiParam({ name: 'id', description: 'ID du packaging' })
  @ApiResponse({ status: 200, description: 'Packaging supprimé' })
  @ApiResponse({ status: 404, description: 'Packaging non trouvé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.packagingService.remove(id, tenantId);
  }
}
