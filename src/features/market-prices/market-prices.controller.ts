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
import { MarketPricesService } from './market-prices.service';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { UpdateMarketPriceDto } from './dto/update-market-price.dto';
import { ImportMarketPricesDto } from './dto/import-market-prices.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Market Prices')
@ApiBearerAuth('supabase-jwt')
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

  @Post('sync-ingredients')
  @ApiOperation({ summary: 'Synchroniser les ingrédients depuis les prix du marché (Food/Beverage)' })
  @ApiResponse({ status: 200, description: 'Synchronisation effectuée' })
  syncIngredients(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-prices/sync-ingredients - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.syncIngredients(tenantId);
  }

  @Post('sync-packagings')
  @ApiOperation({ summary: 'Synchroniser les packagings depuis les prix du marché (Packaging)' })
  @ApiResponse({ status: 200, description: 'Synchronisation effectuée' })
  syncPackagings(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-prices/sync-packagings - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.syncPackagings(tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les prix du marché' })
  @ApiResponse({ status: 200, description: 'Liste des prix' })
  findAll(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /market-prices - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.findAll(tenantId);
  }

  @Get('with-packagings')
  @ApiOperation({ summary: 'Lister tous les prix du marché de type Packaging avec leurs packagings (tenant actuel uniquement)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Recherche par nom, catégorie ou fournisseur' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filtrer par catégorie' })
  @ApiResponse({ status: 200, description: 'Liste des prix de type Packaging avec leurs packagings' })
  findAllWithPackagings(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    this.logger.log(
      `GET /market-prices/with-packagings - User: ${user?.id}, Tenant: ${tenantId}, ` +
      `page=${page}, limit=${limit}, search="${search}", category="${category}"`,
    );
    return this.marketPricesService.findAllWithPackagings(tenantId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      search,
      category,
    });
  }

  @Get('with-ingredients')
  @ApiOperation({ summary: 'Lister tous les prix du marché avec leurs ingrédients (tenant actuel uniquement)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Recherche par nom, catégorie ou fournisseur' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filtrer par catégorie' })
  @ApiQuery({ name: 'goodType', required: false, type: String, description: 'Type de produit: Food, Beverage, Packaging, Other' })
  @ApiResponse({ status: 200, description: 'Liste des prix avec ingrédients' })
  findAllWithIngredients(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('goodType') goodType?: string,
  ) {
    this.logger.log(
      `GET /market-prices/with-ingredients - User: ${user?.id}, Tenant: ${tenantId}, ` +
      `page=${page}, limit=${limit}, search="${search}", category="${category}", goodType=${goodType}`,
    );
    return this.marketPricesService.findAllWithIngredients(tenantId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      search,
      category,
      goodType,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un prix par ID' })
  @ApiParam({ name: 'id', description: 'ID du prix marché' })
  @ApiResponse({ status: 200, description: 'Détails du prix' })
  @ApiResponse({ status: 404, description: 'Prix non trouvé' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /market-prices/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un prix' })
  @ApiParam({ name: 'id', description: 'ID du prix marché' })
  @ApiResponse({ status: 200, description: 'Prix mis à jour' })
  @ApiResponse({ status: 404, description: 'Prix non trouvé' })
  update(@Param('id') id: string, @Body() dto: UpdateMarketPriceDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`PATCH /market-prices/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un prix' })
  @ApiParam({ name: 'id', description: 'ID du prix marché' })
  @ApiResponse({ status: 200, description: 'Prix supprimé' })
  @ApiResponse({ status: 404, description: 'Prix non trouvé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /market-prices/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.remove(id, tenantId);
  }

  @Delete('item/:itemName')
  @ApiOperation({ summary: 'Supprimer tous les prix par nom de produit' })
  @ApiParam({ name: 'itemName', description: 'Nom du produit à supprimer (URL encodé si nécessaire)' })
  @ApiResponse({ status: 200, description: 'Prix supprimés' })
  removeByItemName(@Param('itemName') itemName: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /market-prices/item/${itemName} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.marketPricesService.removeByItemName(decodeURIComponent(itemName), tenantId);
  }
}
