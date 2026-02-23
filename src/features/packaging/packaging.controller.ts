import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { PackagingService } from './packaging.service';

@ApiTags('Packaging')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('packaging')
export class PackagingController {
  private readonly logger = new Logger(PackagingController.name);

  constructor(private readonly packagingService: PackagingService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un packaging' })
  @ApiResponse({ status: 201, description: 'Packaging créé' })
  create(@Body() dto: any, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /packaging - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.packagingService.create(dto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les packagings' })
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
  @ApiResponse({ status: 200, description: 'Détails du packaging' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.packagingService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un packaging' })
  @ApiResponse({ status: 200, description: 'Packaging mis à jour' })
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.packagingService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un packaging' })
  @ApiResponse({ status: 200, description: 'Packaging supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    return this.packagingService.remove(id, tenantId);
  }
}
