import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';

@ApiTags('Suppliers')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('suppliers')
export class SuppliersController {
  private readonly logger = new Logger(SuppliersController.name);

  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un fournisseur' })
  @ApiResponse({ status: 201, description: 'Fournisseur créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  create(@Body() createSupplierDto: CreateSupplierDto, @CurrentUser() user: any) {
    this.logger.log(`POST /suppliers - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.create(createSupplierDto, user.tenantId);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister tous les fournisseurs',
    description: 'Retourne la liste paginée des fournisseurs du tenant courant.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (défaut: 100)', example: 100 })
  @ApiResponse({ status: 200, description: 'Liste paginée des fournisseurs' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    this.logger.log(`GET /suppliers - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.findAll(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un fournisseur par ID' })
  @ApiParam({ name: 'id', description: 'ID du fournisseur' })
  @ApiResponse({ status: 200, description: 'Détails du fournisseur' })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 404, description: 'Fournisseur non trouvé' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`GET /suppliers/${id} - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un fournisseur' })
  @ApiParam({ name: 'id', description: 'ID du fournisseur' })
  @ApiResponse({ status: 200, description: 'Fournisseur mis à jour' })
  @ApiResponse({ status: 404, description: 'Fournisseur non trouvé' })
  update(
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`PATCH /suppliers/${id} - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.update(id, updateSupplierDto, user.tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un fournisseur' })
  @ApiParam({ name: 'id', description: 'ID du fournisseur' })
  @ApiResponse({ status: 200, description: 'Fournisseur supprimé' })
  @ApiResponse({ status: 404, description: 'Fournisseur non trouvé' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`DELETE /suppliers/${id} - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.remove(id, user.tenantId);
  }
}
