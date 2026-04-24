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
import { CreateMenuItemDto, ReplaceMenuItemComponentsDto, ReplaceMenuItemIngredientsDto, ReplaceMenuItemPackagingsDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Menu Items')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('menu-items')
export class MenuItemsController {
  private readonly logger = new Logger(MenuItemsController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un article de menu' })
  @ApiResponse({ status: 201, description: 'Article créé' })
  create(@Body() dto: CreateMenuItemDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-items - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.create(dto, tenantId);
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

  @Post('refresh-costs')
  @ApiOperation({ summary: 'Recalculer les coûts des articles' })
  @ApiResponse({ status: 200, description: 'Coûts recalculés' })
  refreshCosts(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /menu-items/refresh-costs - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.refreshCosts(tenantId);
  }

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

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un article' })
  @ApiParam({ name: 'id', description: 'ID de l’article de menu' })
  @ApiResponse({ status: 200, description: 'Article mis à jour' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`PATCH /menu-items/${id} - User: ${user?.id}, Tenant: ${tenantId}`);
    return this.menuItemsService.update(id, dto, tenantId);
  }

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

  @Post()
  @ApiOperation({ summary: 'Créer un type de produit' })
  @ApiResponse({ status: 201, description: 'Type de produit créé' })
  create(@Body() body: CreateProductTypeDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /product-types - User: ${user?.id}`);
    return this.menuItemsService.createProductType(body.name, tenantId);
  }

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

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une catégorie de produit' })
  @ApiResponse({ status: 200, description: 'Catégorie de produit supprimée' })
  @ApiResponse({ status: 404, description: 'Catégorie de produit non trouvée' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /product-categories/${id} - User: ${user?.id}`);
    return this.menuItemsService.deleteProductCategory(id, tenantId);
  }
}
