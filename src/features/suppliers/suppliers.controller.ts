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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';

@ApiTags('Suppliers')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('suppliers')
export class SuppliersController {
  private readonly logger = new Logger(SuppliersController.name);

  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un fournisseur' })
  @ApiResponse({ status: 201, description: 'Fournisseur créé avec succès' })
  create(@Body() createSupplierDto: CreateSupplierDto, @CurrentUser() user: any) {
    this.logger.log(`POST /suppliers - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.create(createSupplierDto, user.tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les fournisseurs' })
  @ApiResponse({ status: 200, description: 'Liste des fournisseurs' })
  findAll(@CurrentUser() user: any) {
    this.logger.log(`GET /suppliers - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.findAll(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un fournisseur par ID' })
  @ApiResponse({ status: 200, description: 'Détails du fournisseur' })
  @ApiResponse({ status: 404, description: 'Fournisseur non trouvé' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`GET /suppliers/${id} - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un fournisseur' })
  @ApiResponse({ status: 200, description: 'Fournisseur mis à jour' })
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
  @ApiResponse({ status: 200, description: 'Fournisseur supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`DELETE /suppliers/${id} - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.suppliersService.remove(id, user.tenantId);
  }
}
