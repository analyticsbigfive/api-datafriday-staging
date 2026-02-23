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
import { MarketPricesService } from './market-prices.service';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { UpdateMarketPriceDto } from './dto/update-market-price.dto';
import { ImportMarketPricesDto } from './dto/import-market-prices.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Market Prices')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('market-prices')
export class MarketPricesController {
  private readonly logger = new Logger(MarketPricesController.name);

  constructor(private readonly marketPricesService: MarketPricesService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un prix du marché' })
  @ApiResponse({ status: 201, description: 'Prix créé' })
  create(@Body() dto: CreateMarketPriceDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-prices - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.create(dto, tenantId);
  }

  @Post('import')
  @ApiOperation({ summary: 'Importer des prix en masse' })
  @ApiResponse({ status: 201, description: 'Prix importés' })
  bulkImport(@Body() dto: ImportMarketPricesDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-prices/import - ${dto.items.length} items - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.bulkCreate(dto.items, tenantId);
  }

  @Post('deduplicate')
  @ApiOperation({ summary: 'Dédupliquer les prix du marché' })
  @ApiResponse({ status: 200, description: 'Déduplication effectuée' })
  deduplicate(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-prices/deduplicate - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.deduplicate(tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les prix du marché' })
  @ApiResponse({ status: 200, description: 'Liste des prix' })
  findAll(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /market-prices - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un prix par ID' })
  @ApiResponse({ status: 200, description: 'Détails du prix' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /market-prices/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un prix' })
  @ApiResponse({ status: 200, description: 'Prix mis à jour' })
  update(@Param('id') id: string, @Body() dto: UpdateMarketPriceDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`PATCH /market-prices/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un prix' })
  @ApiResponse({ status: 200, description: 'Prix supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /market-prices/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.remove(id, tenantId);
  }

  @Delete('item/:itemName')
  @ApiOperation({ summary: 'Supprimer tous les prix par nom de produit' })
  @ApiResponse({ status: 200, description: 'Prix supprimés' })
  removeByItemName(@Param('itemName') itemName: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /market-prices/item/${itemName} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.removeByItemName(decodeURIComponent(itemName), tenantId);
  }
}
