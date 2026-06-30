import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Logger,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { MenuItemsService } from './menu-items.service';
import { BulkCreateMenuItemsDto, CreateMenuItemDto, ReplaceMenuItemComponentsDto, ReplaceMenuItemIngredientsDto, ReplaceMenuItemPackagingsDto } from './dto/create-menu-item.dto';
import { RecipeBatchDto } from './dto/recipe-batch.dto';
import { ApplyWeezeventPriceDto, ApplyWeezeventPricesBulkDto } from './dto/apply-weezevent-price.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

@ApiTags('Menu Items')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('menu-items')
export class MenuItemsController {
  private readonly logger = new Logger(MenuItemsController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @RequirePermissions('menu.fb.menuItems')
  @Post()
  @ApiOperation({ summary: 'Créer un article de menu' })
  @ApiResponse({ status: 201, description: 'Article créé' })
  create(@Body() dto: CreateMenuItemDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-items - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.create(dto, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post('bulk')
  @ApiOperation({ summary: 'Créer plusieurs articles de menu' })
  @ApiResponse({ status: 201, description: 'Articles créés' })
  bulkCreate(@Body() dto: BulkCreateMenuItemsDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-items/bulk - User: ${user?.id}, Tenant: ${tenantId}, Items: ${dto.items?.length || 0}`);
    return this.menuItemsService.bulkCreate(dto.items || [], tenantId);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister tous les articles de menu',
    description: 'Retourne une liste paginée des articles de menu avec leurs ingrédients, packagings, composants et prix de marché associés.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (défaut: 100)', example: 100 })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des articles de menu',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              basePrice: { type: 'string' },
              totalCost: { type: 'string' },
              margin: { type: 'number', nullable: true },
              ingredients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ingredientId: { type: 'string' },
                    numberOfUnits: { type: 'number' },
                    unitCost: { type: 'string' },
                    ingredient: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        marketPriceId: { type: 'string', nullable: true },
                        marketPrice: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            id: { type: 'string' },
                            price: { type: 'string' },
                            unit: { type: 'string' },
                            itemName: { type: 'string' },
                            goodType: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              packagings: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    packagingId: { type: 'string' },
                    numberOfUnits: { type: 'number' },
                    unitCost: { type: 'string' },
                    packaging: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        marketPriceId: { type: 'string', nullable: true },
                        marketPrice: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            id: { type: 'string' },
                            price: { type: 'string' },
                            unit: { type: 'string' },
                            itemName: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              spaceIds: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number', example: 1 },
            limit: { type: 'number', example: 100 },
            total: { type: 'number', example: 42 },
            totalPages: { type: 'number', example: 1 },
          },
        },
      },
    },
  })
  findAll(
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.logger.log(`GET /menu-items - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.findAll(tenantId, page ? +page : 1, limit ? +limit : 100);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post('refresh-costs')
  @ApiOperation({ summary: 'Recalculer les coûts des articles' })
  @ApiResponse({ status: 200, description: 'Coûts recalculés' })
  refreshCosts(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-items/refresh-costs - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.refreshCosts(tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post(':id/refresh-costs')
  @ApiOperation({ summary: "Recalculer les coûts d'un article" })
  @ApiResponse({ status: 200, description: 'Coûts recalculés (article)' })
  async refreshOneCosts(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`POST /menu-items/${id}/refresh-costs - User: ${user?.id}, Tenant: ${tenantId}`);
    await this.menuItemsService.refreshCosts(tenantId, { itemIds: [id] });
    return this.menuItemsService.findOne(id, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post('apply-weezevent-prices')
  @ApiOperation({
    summary: 'Appliquer le prix Weezevent à plusieurs menu items (étape 3 Data Integration)',
    description:
      "Pour chaque article, applique le prix du produit Weezevent mappé (prix catalogue Weezevent sinon prix modal des ventes) à MenuItem.basePrice et l'archive dans l'historique des prix. Idempotent par article. Renvoie un résumé par article (changed/applied/error).",
  })
  @ApiResponse({ status: 200, description: 'Résumé d’application par article' })
  applyWeezeventPrices(
    @Body() dto: ApplyWeezeventPricesBulkDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`POST /menu-items/apply-weezevent-prices - User: ${user?.id}, Tenant: ${tenantId}, Items: ${dto.items?.length || 0}, Space: ${dto.spaceId ?? 'global'}`);
    return this.menuItemsService.applyWeezeventPricesBulk(dto.items || [], tenantId, dto.spaceId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post('recipes')
  @ApiOperation({
    summary: 'Recettes de plusieurs menu items (réarmement plats composés)',
    description:
      "Renvoie { items: Recipe[], suppliers: Supplier[] }. Chaque item porte readyForSale, comboItem, numberOfPiecesRecipe, cost et components[] (fusion ingrédients + composants + packaging) avec supplierId résolu. Charge tout un space en 1 appel. Body vide/ids absents → tous les items du tenant.",
  })
  @ApiResponse({ status: 200, description: 'Recettes + dictionnaire fournisseurs' })
  getRecipes(@Body() dto: RecipeBatchDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-items/recipes - User: ${user?.id}, Tenant: ${tenantId}, ids: ${dto?.ids?.length ?? 0}`);
    return this.menuItemsService.getRecipes(dto?.ids ?? [], tenantId);
  }

  @Get(':id/recipe')
  @ApiOperation({
    summary: 'Recette d\'un menu item (réarmement plat composé)',
    description:
      "Renvoie l'item avec readyForSale, comboItem, numberOfPiecesRecipe, cost, components[] (fusion ingrédients + composants + packaging, supplierId résolu) et suppliers[]. N'altère pas /menu-items.",
  })
  @ApiParam({ name: 'id', description: 'ID du menu item' })
  @ApiResponse({ status: 200, description: 'Recette + fournisseurs' })
  @ApiResponse({ status: 404, description: 'Article non trouvé' })
  getRecipe(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /menu-items/${id}/recipe - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.getRecipe(id, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post(':id/apply-weezevent-price')
  @ApiOperation({
    summary: 'Appliquer le prix Weezevent à un menu item',
    description:
      "Applique le prix du produit Weezevent mappé (catalogue Weezevent sinon prix modal des ventes) à MenuItem.basePrice et l'archive dans l'historique. Idempotent. Body optionnel { weezeventProductId } si plusieurs produits sont mappés.",
  })
  @ApiParam({ name: 'id', description: 'ID du menu item' })
  @ApiResponse({ status: 200, description: 'Article retarifé + détail de l’application' })
  @ApiResponse({ status: 400, description: 'Aucun produit/prix Weezevent disponible' })
  @ApiResponse({ status: 404, description: 'Article non trouvé' })
  applyWeezeventPrice(
    @Param('id') id: string,
    @Body() dto: ApplyWeezeventPriceDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`POST /menu-items/${id}/apply-weezevent-price - User: ${user?.id}, Tenant: ${tenantId}, Space: ${dto?.spaceId ?? 'global'}`);
    return this.menuItemsService.applyWeezeventPrice(id, tenantId, dto?.weezeventProductId, dto?.spaceId, {
      basePrice: dto?.basePrice,
      vatRate: dto?.vatRate,
    });
  }

  @Get(':id/price-history')
  @ApiOperation({
    summary: 'Historique des prix d’un menu item',
    description: "Liste les prix successivement appliqués (du plus récent au plus ancien) avec leur source et provenance Weezevent — courbe d'évolution du prix de l'article.",
  })
  @ApiParam({ name: 'id', description: 'ID du menu item' })
  @ApiResponse({ status: 200, description: 'Historique des prix' })
  @ApiResponse({ status: 404, description: 'Article non trouvé' })
  getPriceHistory(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /menu-items/${id}/price-history - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.getPriceHistory(id, tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtenir un article par ID',
    description: 'Retourne l\'article avec ses ingrédients (+ marketPrice), packagings (+ marketPrice), composants, type, catégorie et spaceIds.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'article de menu' })
  @ApiResponse({ status: 200, description: 'Détails complets de l\'article' })
  @ApiResponse({ status: 404, description: 'Article non trouvé' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /menu-items/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.findOne(id, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Put(':id/components')
  @ApiOperation({ summary: "Remplacer les composants d'un menu item" })
  @ApiParam({ name: 'id', description: 'ID de l’article de menu' })
  @ApiResponse({ status: 200, description: 'Composants mis à jour' })
  replaceComponents(
    @Param('id') id: string,
    @Body() dto: ReplaceMenuItemComponentsDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PUT /menu-items/${id}/components - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.replaceComponents(id, dto.components, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Put(':id/ingredients')
  @ApiOperation({ summary: "Remplacer les ingrédients d'un menu item" })
  @ApiParam({ name: 'id', description: 'ID de l’article de menu' })
  @ApiResponse({ status: 200, description: 'Ingrédients mis à jour' })
  replaceIngredients(
    @Param('id') id: string,
    @Body() dto: ReplaceMenuItemIngredientsDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PUT /menu-items/${id}/ingredients - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.replaceIngredients(id, dto.ingredients, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Put(':id/packagings')
  @ApiOperation({ summary: "Remplacer les packagings d'un menu item" })
  @ApiParam({ name: 'id', description: 'ID de l’article de menu' })
  @ApiResponse({ status: 200, description: 'Packagings mis à jour' })
  replacePackagings(
    @Param('id') id: string,
    @Body() dto: ReplaceMenuItemPackagingsDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PUT /menu-items/${id}/packagings - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.replacePackagings(id, dto.packagings, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un article' })
  @ApiParam({ name: 'id', description: 'ID de l’article de menu' })
  @ApiResponse({ status: 200, description: 'Article mis à jour' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`PATCH /menu-items/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.update(id, dto, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un article' })
  @ApiParam({ name: 'id', description: 'ID de l’article de menu' })
  @ApiResponse({ status: 200, description: 'Article supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /menu-items/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.remove(id, tenantId);
  }
}

@ApiTags('Product Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('product-types')
export class ProductTypesController {
  private readonly logger = new Logger(ProductTypesController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de produits' })
  @ApiResponse({ status: 200, description: 'Liste des types de produits' })
  findAll(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /product-types - User: ${user?.id}`);
    return this.menuItemsService.getProductTypes(tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post()
  @ApiOperation({ summary: 'Créer un type de produit' })
  @ApiResponse({ status: 201, description: 'Type de produit créé' })
  create(@Body() body: CreateProductTypeDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /product-types - User: ${user?.id}`);
    return this.menuItemsService.createProductType(body.name, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un type de produit' })
  @ApiResponse({ status: 200, description: 'Type de produit mis à jour' })
  @ApiResponse({ status: 404, description: 'Type de produit non trouvé' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateProductTypeDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PATCH /product-types/${id} - User: ${user?.id}`);
    return this.menuItemsService.updateProductType(id, body.name, tenantId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type de produit' })
  @ApiResponse({ status: 200, description: 'Type de produit supprimé' })
  @ApiResponse({ status: 404, description: 'Type de produit non trouvé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /product-types/${id} - User: ${user?.id}`);
    return this.menuItemsService.deleteProductType(id, tenantId);
  }
}

@ApiTags('Product Categories')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('product-categories')
export class ProductCategoriesController {
  private readonly logger = new Logger(ProductCategoriesController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les catégories de produits' })
  @ApiQuery({ name: 'typeId', required: false })
  @ApiResponse({ status: 200, description: 'Liste des catégories de produits' })
  findAll(@Query('typeId') typeId: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /product-categories - User: ${user?.id}`);
    return this.menuItemsService.getProductCategories(tenantId, typeId);
  }

  @RequirePermissions('menu.fb.menuItems')
  @Post()
  @ApiOperation({ summary: 'Créer une catégorie de produit' })
  @ApiResponse({ status: 201, description: 'Catégorie de produit créée' })
  create(@Body() body: CreateProductCategoryDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /product-categories - User: ${user?.id}`);
    return this.menuItemsService.createProductCategory(
      body.name,
      body.typeId,
      tenantId,
      body.productTypeId,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une catégorie de produit' })
  @ApiResponse({ status: 200, description: 'Catégorie de produit mise à jour' })
  @ApiResponse({ status: 404, description: 'Catégorie de produit non trouvée' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateProductCategoryDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PATCH /product-categories/${id} - User: ${user?.id}`);
    return this.menuItemsService.updateProductCategory(
      id,
      { name: body.name, typeId: body.typeId, productTypeId: body.productTypeId },
      tenantId,
    );
  }

  @RequirePermissions('menu.fb.menuItems')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une catégorie de produit' })
  @ApiResponse({ status: 200, description: 'Catégorie de produit supprimée' })
  @ApiResponse({ status: 404, description: 'Catégorie de produit non trouvée' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /product-categories/${id} - User: ${user?.id}`);
    return this.menuItemsService.deleteProductCategory(id, tenantId);
  }
}
