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
  @ApiOperation({
    summary: 'Lister les mappings location → space',
    description: 'Retourne la liste paginée des mappings entre locations Weezevent et spaces DataFriday.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (max 500, défaut: 100)', example: 100 })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des mappings location → space',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              weezeventLocationId: { type: 'string' },
              spaceId: { type: 'string' },
              tenantId: { type: 'string' },
              weezeventLocation: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
              space: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
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
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  getLocationSpaceMappings(
    @CurrentUser() user: any,
    @Query('page') page = 1,
    @Query('limit') limit = 100,
  ) {
    this.logger.log(`GET /mappings/location-space - Tenant: ${user.tenantId}`);
    return this.mappingsService.getLocationSpaceMappings(user.tenantId, +page, +limit);
  }

  @Get('location-space/:locationId')
  @ApiOperation({
    summary: 'Obtenir le mapping d\'une location',
    description: 'Retourne le mapping entre une location Weezevent et un space DataFriday.',
  })
  @ApiResponse({ status: 200, description: 'Mapping de la location' })
  @ApiResponse({ status: 404, description: 'Mapping non trouvé' })
  getLocationSpaceMapping(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.getLocationSpaceMapping(user.tenantId, locationId);
  }

  @Post('location-space')
  @ApiOperation({
    summary: 'Créer/mettre à jour un mapping location → space',
    description: 'Upsert : crée le mapping s\'il n\'existe pas, le met à jour sinon.',
  })
  @ApiResponse({ status: 201, description: 'Mapping créé ou mis à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
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
  @ApiResponse({ status: 404, description: 'Mapping non trouvé' })
  deleteLocationSpaceMapping(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.deleteLocationSpaceMapping(user.tenantId, locationId);
  }

  // ─── Merchant → Element ─────────────────────────────────

  @Get('merchant-element')
  @ApiOperation({
    summary: 'Lister les mappings merchant → element',
    description: 'Retourne la liste paginée des mappings entre merchants Weezevent et SpaceElements (shops) DataFriday.',
  })
  @ApiQuery({ name: 'locationId', required: false, description: 'Filtrer par location Weezevent' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (max 1000, défaut: 200)', example: 200 })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des mappings merchant → element',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              weezeventMerchantId: { type: 'string' },
              spaceElementId: { type: 'string' },
              weezeventLocationId: { type: 'string' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  getMerchantElementMappings(
    @CurrentUser() user: any,
    @Query('locationId') locationId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 200,
  ) {
    return this.mappingsService.getMerchantElementMappings(user.tenantId, locationId, +page, +limit);
  }

  @Post('merchant-element')
  @ApiOperation({ summary: 'Créer/mettre à jour un mapping merchant → element' })
  @ApiResponse({ status: 201, description: 'Mapping créé ou mis à jour' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  createMerchantElementMapping(
    @Body() dto: CreateMerchantElementMappingDto,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.createMerchantElementMapping(dto, user.tenantId);
  }

  @Post('merchant-element/bulk')
  @ApiOperation({
    summary: 'Créer/mettre à jour des mappings merchant → element en masse',
    description: 'Traite par chunks de 500. En cas d\'échec d\'un chunk, bascule sur un fallback par item. Retourne le détail des erreurs éventuelles.',
  })
  @ApiResponse({
    status: 201,
    description: 'Résultat du traitement bulk',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Nombre de mappings créés/mis à jour avec succès', example: 48 },
        total: { type: 'number', description: 'Nombre total envoyés', example: 50 },
        failed: { type: 'number', description: 'Nombre d\'erreurs', example: 2 },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weezeventMerchantId: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
        mappings: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  bulkMerchantElementMappings(
    @Body() dto: BulkMerchantElementMappingDto,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.bulkMerchantElementMappings(dto, user.tenantId);
  }

  @Delete('merchant-element/:merchantId')
  @ApiOperation({ summary: 'Supprimer un mapping merchant → element' })
  @ApiResponse({ status: 200, description: 'Mapping supprimé' })
  @ApiResponse({ status: 404, description: 'Mapping non trouvé' })
  deleteMerchantElementMapping(
    @Param('merchantId') merchantId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.deleteMerchantElementMapping(user.tenantId, merchantId);
  }

  // ─── Product → MenuItem ──────────────────────────────────

  @Get('product-menu')
  @ApiOperation({
    summary: 'Lister les mappings product → menu item',
    description: 'Retourne la liste paginée des mappings entre produits Weezevent et articles de menu DataFriday.',
  })
  @ApiQuery({ name: 'locationId', required: false, description: 'Filtrer par location Weezevent' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page (défaut: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Résultats par page (max 1000, défaut: 200)', example: 200 })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des mappings product → menu item',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              weezeventProductId: { type: 'string' },
              menuItemId: { type: 'string' },
              weezeventLocationId: { type: 'string' },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  getProductMappings(
    @CurrentUser() user: any,
    @Query('locationId') locationId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 200,
  ) {
    return this.mappingsService.getProductMappings(user.tenantId, locationId, +page, +limit);
  }

  @Post('product-menu/bulk')
  @ApiOperation({
    summary: 'Créer/mettre à jour des mappings product → menu item en masse',
    description: 'Traite par chunks de 500. En cas d\'échec d\'un chunk, bascule sur un fallback par item. Retourne le détail des erreurs éventuelles.',
  })
  @ApiResponse({
    status: 201,
    description: 'Résultat du traitement bulk',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 98 },
        total: { type: 'number', example: 100 },
        failed: { type: 'number', example: 2 },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              weezeventProductId: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
        mappings: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  bulkProductMappings(
    @Body() dto: BulkProductMappingDto,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.bulkProductMappings(dto, user.tenantId, user.id);
  }

  @Delete('product-menu/:productId')
  @ApiOperation({ summary: 'Supprimer un mapping product → menu item' })
  @ApiResponse({ status: 200, description: 'Mapping supprimé' })
  @ApiResponse({ status: 404, description: 'Mapping non trouvé' })
  deleteProductMapping(
    @Param('productId') productId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.deleteProductMapping(user.tenantId, productId);
  }

  // ─── Integration Progress ────────────────────────────────

  @Get('progress')
  @ApiOperation({
    summary: 'Progression globale de l\'intégration Weezevent',
    description: 'Retourne pour chaque location Weezevent du tenant les 5 étapes de configuration (space mappé, shops mappés, articles mappés, événements traités, synchronisation). Inclut les méta-compteurs globaux.',
  })
  @ApiResponse({
    status: 200,
    description: 'Progression par location + méta globaux',
    schema: {
      type: 'object',
      properties: {
        locations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              locationId: { type: 'string' },
              locationName: { type: 'string' },
              step1_space_mapped: { type: 'boolean' },
              step2_shops_mapped: { type: 'boolean' },
              step3_menu_items_mapped: { type: 'boolean' },
              step4_events_processed: { type: 'boolean' },
              step5_synchronized: { type: 'boolean' },
              completedSteps: { type: 'number', example: 3 },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            fullyConfigured: { type: 'number' },
            partiallyConfigured: { type: 'number' },
            notStarted: { type: 'number' },
          },
        },
      },
    },
  })
  getAllIntegrationProgress(@CurrentUser() user: any) {
    return this.mappingsService.getAllIntegrationProgress(user.tenantId);
  }

  @Get('progress/:locationId')
  @ApiOperation({
    summary: 'Progression d\'intégration d\'une location spécifique',
    description: 'Retourne l\'état des étapes 1 à 5 pour une location Weezevent donnée.',
  })
  @ApiResponse({ status: 200, description: 'Progression par étape pour la location' })
  @ApiResponse({ status: 404, description: 'Location non trouvée' })
  getIntegrationProgress(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.getIntegrationProgress(user.tenantId, locationId);
  }

  @Get('summary/:locationId')
  @ApiOperation({
    summary: 'Résumé post-synchronisation d\'une location',
    description: 'Utilisé par l\'écran WizardSuccess. Retourne les compteurs de merchants, produits et événements traités pour une location.',
  })
  @ApiResponse({
    status: 200,
    description: 'Résumé merchants / produits / événements',
    schema: {
      type: 'object',
      properties: {
        merchants: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 5 },
            mapped: { type: 'number', example: 4 },
          },
        },
        products: {
          type: 'object',
          properties: {
            total: { type: 'number', example: 120 },
            mapped: { type: 'number', example: 118 },
          },
        },
        events: {
          type: 'object',
          properties: {
            processed: { type: 'number', example: 3 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Location non mappée' })
  getLocationSummary(
    @Param('locationId') locationId: string,
    @CurrentUser() user: any,
  ) {
    return this.mappingsService.getLocationSummary(user.tenantId, locationId);
  }
}
