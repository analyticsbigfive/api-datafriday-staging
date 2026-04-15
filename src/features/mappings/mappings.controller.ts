import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { MappingsService } from './mappings.service';
import {
  CreateLocationSpaceMappingDto,
  CreateMerchantElementMappingDto,
  BulkMerchantElementMappingDto,
  BulkProductMappingDto,
} from './dto/mapping.dto';

@ApiTags('Mappings')
@ApiBearerAuth('supabase-jwt')
@UseGuards(JwtDatabaseGuard)
@Controller('mappings')
export class MappingsController {
  private readonly logger = new Logger(MappingsController.name);

  constructor(private readonly mappingsService: MappingsService) {}

  // ─── Location → Space ───────────────────────────────────

  @Get('location-space')
  @ApiOperation({ summary: 'Lister les mappings location → space' })
  @ApiResponse({ status: 200, description: 'Liste des mappings' })
  getLocationSpaceMappings(@CurrentUser() user: any) {
    this.logger.log(`GET /mappings/location-space - Tenant: ${user.tenantId}`);
    return this.mappingsService.getLocationSpaceMappings(user.tenantId);
  }

  @Get('location-space/:locationId')
  @ApiOperation({ summary: 'Obtenir le mapping d\'une location' })
  @ApiResponse({ status: 200, description: 'Mapping de la location' })
  getLocationSpaceMapping(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.getLocationSpaceMapping(user.tenantId, locationId);
  }

  @Post('location-space')
  @ApiOperation({ summary: 'Créer/mettre à jour un mapping location → space' })
  @ApiResponse({ status: 201, description: 'Mapping créé' })
  createLocationSpaceMapping(
    @Body() dto: CreateLocationSpaceMappingDto,
    @CurrentUser() user: any,
  ) {
    this.logger.log(`POST /mappings/location-space - location=${dto.weezeventLocationId}`);
    return this.mappingsService.createLocationSpaceMapping(dto, user.tenantId);
  }

  @Delete('location-space/:locationId')
  @ApiOperation({ summary: 'Supprimer un mapping location → space' })
  @ApiResponse({ status: 200, description: 'Mapping supprimé' })
  deleteLocationSpaceMapping(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.deleteLocationSpaceMapping(user.tenantId, locationId);
  }

  // ─── Merchant → Element ─────────────────────────────────

  @Get('merchant-element')
  @ApiOperation({ summary: 'Lister les mappings merchant → element' })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiResponse({ status: 200, description: 'Liste des mappings' })
  getMerchantElementMappings(
    @CurrentUser() user: any,
    @Query('locationId') locationId?: string,
  ) {
    return this.mappingsService.getMerchantElementMappings(user.tenantId, locationId);
  }

  @Post('merchant-element')
  @ApiOperation({ summary: 'Créer/mettre à jour un mapping merchant → element' })
  @ApiResponse({ status: 201, description: 'Mapping créé' })
  createMerchantElementMapping(
    @Body() dto: CreateMerchantElementMappingDto,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.createMerchantElementMapping(dto, user.tenantId);
  }

  @Post('merchant-element/bulk')
  @ApiOperation({ summary: 'Créer/mettre à jour des mappings merchant → element en masse' })
  @ApiResponse({ status: 201, description: 'Mappings créés' })
  bulkMerchantElementMappings(
    @Body() dto: BulkMerchantElementMappingDto,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.bulkMerchantElementMappings(dto, user.tenantId);
  }

  @Delete('merchant-element/:merchantId')
  @ApiOperation({ summary: 'Supprimer un mapping merchant → element' })
  @ApiResponse({ status: 200, description: 'Mapping supprimé' })
  deleteMerchantElementMapping(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.deleteMerchantElementMapping(user.tenantId, merchantId);
  }

  // ─── Product → MenuItem ──────────────────────────────────

  @Get('product-menu')
  @ApiOperation({ summary: 'Lister les mappings product → menu item' })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiResponse({ status: 200, description: 'Liste des mappings' })
  getProductMappings(
    @CurrentUser() user: any,
    @Query('locationId') locationId?: string,
  ) {
    return this.mappingsService.getProductMappings(user.tenantId, locationId);
  }

  @Post('product-menu/bulk')
  @ApiOperation({ summary: 'Créer/mettre à jour des mappings product → menu item en masse' })
  @ApiResponse({ status: 201, description: 'Mappings créés' })
  bulkProductMappings(
    @Body() dto: BulkProductMappingDto,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.bulkProductMappings(dto, user.tenantId, user.id);
  }

  @Delete('product-menu/:productId')
  @ApiOperation({ summary: 'Supprimer un mapping product → menu item' })
  @ApiResponse({ status: 200, description: 'Mapping supprimé' })
  deleteProductMapping(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.deleteProductMapping(user.tenantId, productId);
  }

  // ─── Integration Progress ────────────────────────────────

  @Get('progress/:locationId')
  @ApiOperation({ summary: 'Obtenir la progression d\'intégration d\'une location' })
  @ApiResponse({ status: 200, description: 'Progression par étape' })
  getIntegrationProgress(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.getIntegrationProgress(user.tenantId, locationId);
  }
}
