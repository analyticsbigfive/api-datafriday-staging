import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SpacesService } from './spaces.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { QuerySpaceDto } from './dto/query-space.dto';
import { CreateConfigDto } from './dto/create-config.dto';
import { UpdateSpaceImageDto } from './dto/update-space-image.dto';
import { GrantSpaceAccessDto } from './dto/grant-space-access.dto';
import { UpdateSpaceElementDto } from './dto/update-space-element.dto';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { Roles } from '../../core/auth/decorators/roles.decorator';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { CurrentTenant } from '../../core/auth/decorators/current-tenant.decorator';

@ApiTags('Spaces')
@ApiBearerAuth('supabase-jwt')
@Controller('spaces')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  /**
   * Create a new space
   */
  @Post()
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer un nouvel espace/établissement',
    description:
      'Crée un nouvel espace pour l\'organisation. Réservé aux ADMIN et MANAGER.',
  })
  @ApiBody({ type: CreateSpaceDto })
  @ApiResponse({
    status: 201,
    description: 'Espace créé avec succès',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'space-abc123' },
        name: { type: 'string', example: 'Restaurant Le Gourmet' },
        image: { type: 'string', nullable: true },
        tenantId: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès refusé - rôle insuffisant' })
  async create(@CurrentUser() user: any, @Body() dto: CreateSpaceDto) {
    return this.spacesService.create(user.tenantId, dto);
  }

  /**
   * Get all spaces for current tenant
   */
  @Get()
  @ApiOperation({
    summary: 'Lister tous les espaces de l\'organisation',
    description: 'Retourne la liste paginée des espaces de l\'organisation.',
  })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Liste des espaces avec pagination',
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
              image: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              _count: {
                type: 'object',
                properties: {
                  configs: { type: 'number' },
                  pinnedByUsers: { type: 'number' },
                },
              },
            },
          },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  async findAll(@CurrentUser() user: any, @Query() query: QuerySpaceDto) {
    if (!user.tenantId) {
      throw new ForbiddenException('Organisation requise. Veuillez compléter l\'onboarding.');
    }
    return this.spacesService.findAll(user.tenantId, query);
  }

  /**
   * Get space statistics
   */
  @Get('statistics')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Statistiques des espaces',
    description: 'Retourne les statistiques globales sur les espaces.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques',
    schema: {
      type: 'object',
      properties: {
        totalSpaces: { type: 'number', example: 5 },
        totalConfigs: { type: 'number', example: 12 },
        recentSpaces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              image: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getStatistics(@CurrentUser() user: any) {
    return this.spacesService.getStatistics(user.tenantId);
  }

  /**
   * Get pinned spaces for current user
   */
  @Get('pinned')
  @ApiOperation({
    summary: 'Obtenir les espaces épinglés',
    description: 'Retourne la liste des espaces favoris/épinglés par l\'utilisateur.',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des espaces épinglés',
  })
  async getPinned(@CurrentUser() user: any) {
    return this.spacesService.getPinned(user.id, user.tenantId);
  }

  /**
   * Get space by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtenir un espace par ID',
    description: 'Retourne les détails complets d\'un espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiQuery({ name: 'light', required: false, type: Boolean, description: 'Mode léger (sans image)' })
  @ApiResponse({
    status: 200,
    description: 'Détails de l\'espace',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        image: { type: 'string', nullable: true },
        tenantId: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        configs: {
          type: 'array',
          description: 'Liste complète des configurations avec leurs données (floors, forecourt, externalMerch)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              spaceId: { type: 'string' },
              capacity: { type: 'number', nullable: true },
              data: { 
                type: 'object', 
                nullable: true,
                description: 'Données complètes de la configuration (floors, forecourt, externalMerch)',
                properties: {
                  floors: { type: 'array', description: 'Liste des étages avec leurs éléments' },
                  forecourt: { type: 'object', nullable: true, description: 'Configuration du parvis' },
                  externalMerch: { type: 'object', nullable: true, description: 'Configuration merchandising externe' },
                },
              },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        _count: {
          type: 'object',
          properties: {
            pinnedByUsers: { type: 'number' },
            userAccess: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async findOne(
    @Param('id') id: string, 
    @CurrentUser() user: any,
    @Query('light') light?: string,
  ) {
    const space = await this.spacesService.findOne(id, user.tenantId);
    
    // In light mode, exclude heavy data like images
    if (light === 'true') {
      const { image, ...lightSpace } = space;
      return lightSpace;
    }
    
    return space;
  }

  /**
   * Update a space
   */
  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Mettre à jour un espace',
    description: 'Modifie les informations d\'un espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace mis à jour' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateSpaceDto,
  ) {
    return this.spacesService.update(id, user.tenantId, dto);
  }

  /**
   * Update space image
   */
  @Put(':id/image')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Mettre à jour l\'image d\'un espace',
    description: 'Met à jour l\'image d\'un espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: UpdateSpaceImageDto })
  @ApiResponse({ status: 200, description: 'Image mise à jour' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async updateImage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: UpdateSpaceImageDto,
  ) {
    return this.spacesService.updateImage(id, user.tenantId, body.image);
  }

  /**
   * Get configurations for a space
   */
  @Get(':id/configurations')
  @ApiOperation({
    summary: 'Obtenir les configurations d\'un espace',
    description: 'Retourne la liste des configurations associées à un espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Liste des configurations',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          spaceId: { type: 'string' },
          capacity: { type: 'number', nullable: true },
          data: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          _count: {
            type: 'object',
            properties: {
              floors: { type: 'number' },
              stations: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getConfigurations(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.getConfigurations(id, user.tenantId);
  }

  /**
   * Get shop details for a space (all shops created in configurations)
   */
  @Get(':id/shop-details')
  @ApiOperation({
    summary: 'Obtenir tous les shops (points de vente) d\'un espace',
    description:
      'Retourne tous les SpaceElements de type shop créés dans les configurations de cet espace, avec leurs données de vente agrégées si mappés à Weezevent.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Liste des shops avec leurs détails et données de vente',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shopId: { type: 'string', description: 'ID du SpaceElement (shop)' },
          shopName: { type: 'string', description: 'Nom du shop' },
          shopType: { type: 'string', description: 'Type du shop (fnb-food, fnb-bar, merchshop, etc.)' },
          shopSubTypes: { type: 'array', items: { type: 'string' }, description: 'Sous-types spécifiques' },
          configId: { type: 'string', description: 'ID de la configuration' },
          configName: { type: 'string', description: 'Nom de la configuration' },
          locationId: { type: 'string', description: 'ID du floor ou forecourt' },
          locationName: { type: 'string', description: 'Nom du floor ou forecourt' },
          locationType: { type: 'string', enum: ['floor', 'forecourt'], description: 'Type de localisation' },
          revenue: { type: 'number', description: 'Revenu total HT (si mappé à Weezevent)' },
          transactionCount: { type: 'number', description: 'Nombre de transactions (si mappé à Weezevent)' },
          itemsCount: { type: 'number', description: 'Nombre d\'items vendus (si mappé à Weezevent)' },
          isMappedToWeezevent: { type: 'boolean', description: 'Indique si le shop est mappé à un merchant Weezevent' },
          weezeventMerchantId: { type: 'string', nullable: true, description: 'ID du merchant Weezevent mappé' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getShopDetails(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.getShopDetails(id, user.tenantId);
  }

  /**
   * Get minute-level timeline for one event: minute × shop × menuItem
   */
  @Get(':id/event-timeline/:eventId')
  @ApiOperation({
    summary: 'Timeline minute par minute d\'un événement',
    description:
      'Retourne les transactions agrégées par minute × shop (SpaceElement) × article (MenuItem mappé) pour un événement donné. ' +
      'Source de données : WeezeventTransaction + WeezeventTransactionItem, jointure avec les mappings shop (Step 2) et menu (Step 3) du wizard. ' +
      'Produits non mappés au Step 3 sont inclus avec menuItemId = null.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiParam({ name: 'eventId', description: 'ID de l\'événement Weezevent (WeezeventEvent.id)' })
  @ApiResponse({
    status: 200,
    description: 'Enregistrements timeline (un par minute × shop × article)',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          minute:           { type: 'string', example: '19:42', description: 'Minute HH:MM (heure locale UTC)' },
          shopId:           { type: 'string', description: 'ID du SpaceElement (shop)' },
          shopName:         { type: 'string', description: 'Nom du shop' },
          shopType:         { type: 'string', nullable: true, description: 'Type du shop (fnb-food, fnb-bar…)' },
          shopArea:         { type: 'string', nullable: true, description: 'Zone du shop' },
          weezeventProductId: { type: 'string', nullable: true, description: 'ID produit Weezevent brut' },
          menuItemId:       { type: 'string', nullable: true, description: 'ID MenuItem mappé (null si produit non mappé au Step 3)' },
          menuItemName:     { type: 'string', nullable: true, description: 'Nom de l\'article' },
          menuItemType:     { type: 'string', nullable: true, description: 'Type produit (ProductType)' },
          menuItemCategory: { type: 'string', nullable: true, description: 'Catégorie produit (ProductCategory)' },
          quantity:         { type: 'integer', description: 'Quantité vendue sur cette minute' },
          transactionCount: { type: 'integer', description: 'Transactions distinctes sur cette minute' },
          revenueHt:        { type: 'number', description: 'Revenu HT (€) sur cette minute' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async getEventTimeline(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: any,
  ) {
    return this.spacesService.getEventTimeline(id, eventId, user.tenantId);
  }

  /**
   * Delete a space
   */
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Supprimer un espace',
    description: 'Supprime définitivement un espace. Réservé aux ADMIN uniquement.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace supprimé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.remove(id, user.tenantId);
  }

  /**
   * Pin a space
   */
  @Post(':id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Épingler un espace',
    description: 'Ajoute l\'espace aux favoris de l\'utilisateur.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace épinglé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async pin(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.pin(id, user.id, user.tenantId);
  }

  /**
   * Unpin a space
   */
  @Delete(':id/pin')
  @ApiOperation({
    summary: 'Désépingler un espace',
    description: 'Retire l\'espace des favoris de l\'utilisateur.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({ status: 200, description: 'Espace désépinglé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé ou non épinglé' })
  async unpin(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.unpin(id, user.id, user.tenantId);
  }

  /**
   * Grant user access to a space
   */
  @Post(':id/access')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Donner accès à un utilisateur',
    description:
      'Accorde un accès spécifique à un utilisateur sur cet espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ type: GrantSpaceAccessDto })
  @ApiResponse({ status: 200, description: 'Accès accordé' })
  @ApiResponse({ status: 404, description: 'Espace ou utilisateur non trouvé' })
  async grantAccess(
    @Param('id') id: string,
    @Body() body: GrantSpaceAccessDto,
    @CurrentUser() user: any,
  ) {
    return this.spacesService.grantAccess(id, body.userId, body.role, user.tenantId);
  }

  /**
   * Revoke user access to a space
   */
  @Delete(':id/access/:userId')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Révoquer l\'accès d\'un utilisateur',
    description: 'Retire l\'accès d\'un utilisateur à cet espace. Réservé aux ADMIN et MANAGER.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiParam({ name: 'userId', description: 'ID de l\'utilisateur' })
  @ApiResponse({ status: 200, description: 'Accès révoqué' })
  @ApiResponse({ status: 404, description: 'Accès non trouvé' })
  async revokeAccess(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.spacesService.revokeAccess(id, userId, user.tenantId);
  }

  /**
   * Get users with access to a space
   */
  @Get(':id/users')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Lister les utilisateurs ayant accès',
    description: 'Retourne la liste des utilisateurs avec leurs rôles sur cet espace.',
  })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          spaceId: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'] },
          grantedAt: { type: 'string', format: 'date-time' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async getSpaceUsers(@Param('id') id: string, @CurrentUser() user: any) {
    return this.spacesService.getSpaceUsers(id, user.tenantId);
  }

  /**
   * Quick-create a shop element for a space (from Weezevent import flow)
   */
  @Post(':id/quick-element')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer rapidement un shop dans un espace (import Weezevent)' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', example: 'shop' } }, required: ['name'] } })
  @ApiResponse({ status: 201, description: 'Shop créé' })
  async quickCreateElement(
    @Param('id') spaceId: string,
    @CurrentUser() user: any,
    @Body() body: { name: string; type?: string },
  ) {
    return this.spacesService.quickCreateElement(spaceId, user.tenantId, body);
  }
}

// ==================== CONFIGURATIONS CONTROLLER ====================

@ApiTags('Configurations')
@ApiBearerAuth('supabase-jwt')
@Controller('configurations')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class ConfigurationsController {
  private readonly logger = new Logger(ConfigurationsController.name);
  
  constructor(private readonly spacesService: SpacesService) {}

  /**
   * Create or update a configuration
   */
  @Post()
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Créer ou mettre à jour une configuration',
    description:
      'Crée une nouvelle configuration ou met à jour une configuration existante pour un espace.',
  })
  @ApiBody({ type: CreateConfigDto })
  @ApiResponse({
    status: 201,
    description: 'Configuration créée ou mise à jour avec succès',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'config-1234567890' },
        name: { type: 'string', example: 'Main Configuration' },
        spaceId: { type: 'string', example: 'space-abc123' },
        capacity: { type: 'number', nullable: true, example: 5000 },
        data: {
          type: 'object',
          nullable: true,
          description: 'Configuration data (floors, forecourt, etc.)',
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Non authentifié' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  @ApiResponse({ status: 404, description: 'Espace non trouvé' })
  async saveConfiguration(
    @Body() dto: CreateConfigDto,
    @CurrentTenant() tenantId: string,
  ) {
    this.logger.log(`POST /configurations - Tenant: ${tenantId}, SpaceId: ${dto.spaceId}, ConfigName: ${dto.name}`);
    return this.spacesService.saveConfiguration(dto, tenantId);
  }

  /**
   * Get a configuration by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtenir une configuration par ID',
    description: 'Retourne les détails complets d\'une configuration.',
  })
  @ApiParam({ name: 'id', description: 'ID de la configuration' })
  @ApiResponse({
    status: 200,
    description: 'Configuration trouvée',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        spaceId: { type: 'string' },
        capacity: { type: 'number', nullable: true },
        data: { type: 'object', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Configuration non trouvée' })
  async getConfiguration(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.spacesService.getConfiguration(id, tenantId);
  }

  /**
   * Delete a configuration
   */
  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Supprimer une configuration',
    description: 'Supprime définitivement une configuration.',
  })
  @ApiParam({ name: 'id', description: 'ID de la configuration' })
  @ApiResponse({ status: 200, description: 'Configuration supprimée' })
  @ApiResponse({ status: 404, description: 'Configuration non trouvée' })
  @ApiResponse({ status: 403, description: 'Accès refusé' })
  async deleteConfiguration(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.spacesService.deleteConfiguration(id, tenantId);
  }

  /**
   * Update a shop (SpaceElement) — image, name, type, shopTypes
   */
  @Patch('elements/:elementId')
  @Roles('ADMIN', 'MANAGER')
  @ApiOperation({
    summary: 'Modifier un shop (SpaceElement)',
    description: 'Met à jour le nom, l\'image, le type principal et/ou les sous-types d\'un SpaceElement (shop). Vérifie que l\'élément appartient bien au tenant avant modification.',
  })
  @ApiParam({ name: 'elementId', description: 'ID du SpaceElement (shop)' })
  @ApiBody({ type: UpdateSpaceElementDto })
  @ApiResponse({
    status: 200,
    description: 'Shop mis à jour',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string', example: 'fnb_food' },
        shopTypes: { type: 'array', items: { type: 'string' }, example: ['Food', 'Beverages'] },
        image: { type: 'string', nullable: true },
        notes: { type: 'string', nullable: true },
        floorId: { type: 'string', nullable: true },
        forecourtId: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Shop n\'appartient pas au tenant' })
  @ApiResponse({ status: 404, description: 'Shop non trouvé' })
  async updateSpaceElement(
    @Param('elementId') elementId: string,
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateSpaceElementDto,
  ) {
    return this.spacesService.updateSpaceElement(elementId, tenantId, dto);
  }

  /**
   * Quick-create a shop element for a space (from Weezevent import flow)
   */
  @Post(':id/quick-element')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer rapidement un shop dans un espace (import Weezevent)' })
  @ApiParam({ name: 'id', description: 'ID de l\'espace' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', example: 'shop' } }, required: ['name'] } })
  @ApiResponse({ status: 201, description: 'Shop créé' })
  async quickCreateElement(
    @CurrentTenant() tenantId: string,
    @Param('id') spaceId: string,
    @Body() body: { name: string; type?: string },
  ) {
    return this.spacesService.quickCreateElement(spaceId, tenantId, body);
  }
}
