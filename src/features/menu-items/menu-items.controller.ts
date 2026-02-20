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
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { MenuItemsService } from './menu-items.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';

@ApiTags('Menu Items')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('menu-items')
export class MenuItemsController {
  private readonly logger = new Logger(MenuItemsController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un article de menu' })
  @ApiResponse({ status: 201, description: 'Article créé' })
  create(@Body() dto: CreateMenuItemDto, @CurrentUser() user: any) {
    this.logger.log(`POST /menu-items - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.menuItemsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les articles de menu' })
  @ApiResponse({ status: 200, description: 'Liste des articles' })
  findAll(@CurrentUser() user: any) {
    this.logger.log(`GET /menu-items - User: ${user?.id}, Tenant: ${user?.tenantId}`);
    return this.menuItemsService.findAll();
  }

  @Post('refresh-costs')
  @ApiOperation({ summary: 'Recalculer les coûts des articles' })
  @ApiResponse({ status: 200, description: 'Coûts recalculés' })
  refreshCosts(@CurrentUser() user: any) {
    this.logger.log(`POST /menu-items/refresh-costs - User: ${user?.id}`);
    return this.menuItemsService.refreshCosts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un article par ID' })
  @ApiResponse({ status: 200, description: 'Détails de l\'article' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`GET /menu-items/${id} - User: ${user?.id}`);
    return this.menuItemsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un article' })
  @ApiResponse({ status: 200, description: 'Article mis à jour' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuItemDto, @CurrentUser() user: any) {
    this.logger.log(`PATCH /menu-items/${id} - User: ${user?.id}`);
    return this.menuItemsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un article' })
  @ApiResponse({ status: 200, description: 'Article supprimé' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    this.logger.log(`DELETE /menu-items/${id} - User: ${user?.id}`);
    return this.menuItemsService.remove(id);
  }
}

@ApiTags('Product Types')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('product-types')
export class ProductTypesController {
  private readonly logger = new Logger(ProductTypesController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de produits' })
  findAll(@CurrentUser() user: any) {
    this.logger.log(`GET /product-types - User: ${user?.id}`);
    return this.menuItemsService.getProductTypes();
  }

  @Post()
  @ApiOperation({ summary: 'Créer un type de produit' })
  create(@Body() body: { name: string; tenantId?: string }, @CurrentUser() user: any) {
    this.logger.log(`POST /product-types - User: ${user?.id}`);
    return this.menuItemsService.createProductType(body.name, body.tenantId || user?.tenantId);
  }
}

@ApiTags('Product Categories')
@ApiBearerAuth()
@UseGuards(JwtDatabaseGuard)
@Controller('product-categories')
export class ProductCategoriesController {
  private readonly logger = new Logger(ProductCategoriesController.name);

  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les catégories de produits' })
  @ApiQuery({ name: 'typeId', required: false })
  findAll(@Query('typeId') typeId: string, @CurrentUser() user: any) {
    this.logger.log(`GET /product-categories - User: ${user?.id}`);
    return this.menuItemsService.getProductCategories(typeId);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une catégorie de produit' })
  create(@Body() body: { name: string; typeId: string; tenantId?: string }, @CurrentUser() user: any) {
    this.logger.log(`POST /product-categories - User: ${user?.id}`);
    return this.menuItemsService.createProductCategory(body.name, body.typeId, body.tenantId || user?.tenantId);
  }
}
