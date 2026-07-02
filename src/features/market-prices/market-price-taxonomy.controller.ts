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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';
import { MarketPriceTaxonomyService } from './market-price-taxonomy.service';
import { CreateMarketPriceTypeDto } from './dto/create-market-price-type.dto';
import { UpdateMarketPriceTypeDto } from './dto/update-market-price-type.dto';
import { CreateMarketPriceCategoryDto } from './dto/create-market-price-category.dto';
import { UpdateMarketPriceCategoryDto } from './dto/update-market-price-category.dto';

@ApiTags('Market Price Types')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('market-price-types')
export class MarketPriceTypesController {
  private readonly logger = new Logger(MarketPriceTypesController.name);

  constructor(private readonly taxonomyService: MarketPriceTaxonomyService) {}

  @Get()
  @ApiOperation({ summary: 'Lister tous les Market Price Types' })
  @ApiResponse({ status: 200, description: 'Liste des Market Price Types' })
  findAll(@CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /market-price-types - User: ${user?.id}`);
    return this.taxonomyService.getTypes(tenantId);
  }

  @RequirePermissions('menu.fb.marketPrices')
  @Post()
  @ApiOperation({ summary: 'Créer un Market Price Type' })
  @ApiResponse({ status: 201, description: 'Market Price Type créé' })
  create(@Body() body: CreateMarketPriceTypeDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-price-types - User: ${user?.id}`);
    return this.taxonomyService.createType(body.name, tenantId);
  }

  @RequirePermissions('menu.fb.marketPrices')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un Market Price Type' })
  @ApiResponse({ status: 200, description: 'Market Price Type mis à jour' })
  @ApiResponse({ status: 404, description: 'Market Price Type non trouvé' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateMarketPriceTypeDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PATCH /market-price-types/${id} - User: ${user?.id}`);
    return this.taxonomyService.updateType(id, body.name, tenantId);
  }

  @RequirePermissions('menu.fb.marketPrices')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un Market Price Type' })
  @ApiResponse({ status: 200, description: 'Market Price Type supprimé' })
  @ApiResponse({ status: 404, description: 'Market Price Type non trouvé' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /market-price-types/${id} - User: ${user?.id}`);
    return this.taxonomyService.deleteType(id, tenantId);
  }
}

@ApiTags('Market Price Categories')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('market-price-categories')
export class MarketPriceCategoriesController {
  private readonly logger = new Logger(MarketPriceCategoriesController.name);

  constructor(private readonly taxonomyService: MarketPriceTaxonomyService) {}

  @Get()
  @ApiOperation({ summary: 'Lister toutes les Market Price Categories' })
  @ApiQuery({ name: 'typeId', required: false })
  @ApiResponse({ status: 200, description: 'Liste des Market Price Categories' })
  findAll(@Query('typeId') typeId: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`GET /market-price-categories - User: ${user?.id}`);
    return this.taxonomyService.getCategories(tenantId, typeId);
  }

  @RequirePermissions('menu.fb.marketPrices')
  @Post()
  @ApiOperation({ summary: 'Créer une Market Price Category' })
  @ApiResponse({ status: 201, description: 'Market Price Category créée' })
  create(@Body() body: CreateMarketPriceCategoryDto, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`POST /market-price-categories - User: ${user?.id}`);
    return this.taxonomyService.createCategory(body.name, body.typeId ?? body.marketPriceTypeId, tenantId);
  }

  @RequirePermissions('menu.fb.marketPrices')
  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une Market Price Category' })
  @ApiResponse({ status: 200, description: 'Market Price Category mise à jour' })
  @ApiResponse({ status: 404, description: 'Market Price Category non trouvée' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateMarketPriceCategoryDto,
    @CurrentUser() user: any,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`PATCH /market-price-categories/${id} - User: ${user?.id}`);
    return this.taxonomyService.updateCategory(
      id,
      { name: body.name, typeId: body.typeId ?? body.marketPriceTypeId },
      tenantId,
    );
  }

  @RequirePermissions('menu.fb.marketPrices')
  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une Market Price Category' })
  @ApiResponse({ status: 200, description: 'Market Price Category supprimée' })
  @ApiResponse({ status: 404, description: 'Market Price Category non trouvée' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @CurrentTenant() tenantId: string) {
    this.logger.log(`DELETE /market-price-categories/${id} - User: ${user?.id}`);
    return this.taxonomyService.deleteCategory(id, tenantId);
  }
}
