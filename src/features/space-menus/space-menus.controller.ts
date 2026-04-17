import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceMenusService } from './space-menus.service';
import { SaveSpaceMenuConfigurationDto } from './dto/save-space-menu-configuration.dto';

@ApiTags('Space Menus')
@ApiBearerAuth('supabase-jwt')
@Controller('space-menu')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceMenusController {
  constructor(private readonly spaceMenusService: SpaceMenusService) {}

  @Get('shop/:shopId')
  @ApiOperation({ 
    summary: 'Get all menu items assigned to a shop (SpaceElement)',
    description: 'Retourne tous les produits (MenuItems) assignés à un shop avec leurs ingrédients, composants et packaging. Inclut la structure complète imbriquée : components → ingredients, ingredients directs, et packagings.'
  })
  @ApiParam({ name: 'shopId', description: 'ID du shop (SpaceElement)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des produits du shop avec détails complets (prix, coûts, marges, ingrédients, composants, packaging)',
    schema: {
      type: 'object',
      properties: {
        shopId: { type: 'string', example: 'clx1a2b3c4d5e6f7g8h9i0j1k' },
        shopName: { type: 'string', example: 'Bar Principal' },
        shopType: { type: 'string', example: 'fnb_bar' },
        menuItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'menuitem-burger-classic' },
              name: { type: 'string', example: 'Burger Classic' },
              basePrice: { type: 'number', example: 12.50, description: 'Prix de vente HT' },
              totalCost: { type: 'number', example: 4.25, description: 'Coût total de production' },
              margin: { type: 'number', example: 65.6, description: 'Marge en pourcentage' },
              description: { type: 'string', example: 'Burger classique avec frites' },
              picture: { type: 'string', nullable: true, example: 'https://cdn.example.com/burger.jpg' },
              diet: { 
                type: 'array', 
                items: { type: 'string', enum: ['VEGAN', 'VEGETARIAN', 'HALAL', 'KOSHER', 'NONE'] },
                example: ['NONE']
              },
              allergens: { 
                type: 'array', 
                items: { type: 'string', enum: ['GLUTEN', 'LACTOSE', 'EGGS', 'NUTS', 'FISH', 'SHELLFISH', 'SOY'] },
                example: ['GLUTEN', 'LACTOSE']
              },
              storageType: {
                type: 'array',
                items: { type: 'string', enum: ['FROZEN', 'REFRIGERATED', 'DRY', 'AMBIENT'] },
                example: ['FROZEN', 'REFRIGERATED']
              },
              readyForSale: { type: 'string', nullable: true, enum: ['Yes', 'No'], example: 'Yes' },
              comboItem: { type: 'string', nullable: true, enum: ['Yes', 'No'], example: 'No' },
              numberOfPiecesRecipe: { type: 'number', nullable: true, example: 1 },
              enabled: { type: 'boolean', example: true, description: 'Si le produit est activé pour ce shop' },
              productType: { 
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string', example: 'Food' }
                }
              },
              productCategory: { 
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string', example: 'Burgers' }
                }
              },
              components: {
                type: 'array',
                description: 'Composants pré-fabriqués utilisés dans la recette',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    numberOfUnits: { type: 'number', example: 1, description: 'Quantité utilisée' },
                    unitCost: { type: 'number', example: 0.80, description: 'Coût unitaire' },
                    totalCost: { type: 'number', example: 0.80, description: 'Coût total (numberOfUnits × unitCost)' },
                    storageType: { type: 'string', nullable: true, example: 'FROZEN' },
                    component: {
                      type: 'object',
                      description: 'Détails du composant',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Pain burger brioche' },
                        unit: { type: 'string', example: 'piece' },
                        unitCost: { type: 'number', example: 0.80 },
                        totalCost: { type: 'number', example: 0.80 },
                        storageType: { type: 'array', items: { type: 'string' } },
                        ingredients: {
                          type: 'array',
                          description: 'Ingrédients contenus dans le composant',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              numberOfUnits: { type: 'number', example: 0.08 },
                              unitCost: { type: 'number', example: 2.50 },
                              totalCost: { type: 'number', example: 0.20 },
                              ingredient: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  name: { type: 'string', example: 'Farine T55' },
                                  unit: { type: 'string', example: 'kg' },
                                  unitCost: { type: 'number', example: 2.50 },
                                  storageType: { type: 'array', items: { type: 'string' } }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              ingredients: {
                type: 'array',
                description: 'Ingrédients directs (matières premières)',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    numberOfUnits: { type: 'number', example: 0.15, description: 'Quantité utilisée' },
                    unitCost: { type: 'number', example: 12.00, description: 'Coût unitaire' },
                    totalCost: { type: 'number', example: 1.80, description: 'Coût total' },
                    storageType: { type: 'string', nullable: true, example: 'FROZEN' },
                    ingredient: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Steak haché 15% MG' },
                        unit: { type: 'string', example: 'kg' },
                        unitCost: { type: 'number', example: 12.00 },
                        storageType: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  }
                }
              },
              packagings: {
                type: 'array',
                description: 'Emballages utilisés pour servir le produit',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    numberOfUnits: { type: 'number', example: 1, description: 'Quantité utilisée' },
                    unitCost: { type: 'number', example: 0.35, description: 'Coût unitaire' },
                    totalCost: { type: 'number', example: 0.35, description: 'Coût total' },
                    storageType: { type: 'string', nullable: true, example: 'DRY' },
                    packaging: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Boîte burger carton recyclable' },
                        unit: { type: 'string', example: 'piece' },
                        unitCost: { type: 'number', example: 0.35 },
                        storageType: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Shop non trouvé ou n\'appartient pas au tenant' })
  @ApiResponse({ status: 401, description: 'Non authentifié - Token JWT invalide ou manquant' })
  async getShopMenu(
    @Param('shopId') shopId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getShopMenu(shopId, user.tenantId);
  }

  @Get(':spaceId/:configId')
  @ApiOperation({ summary: 'Get menu configuration for a space/config' })
  @ApiParam({ name: 'spaceId', description: 'ID de l’espace' })
  @ApiParam({ name: 'configId', description: 'ID de la configuration' })
  @ApiResponse({ status: 200, description: 'Configuration de menu de l’espace' })
  async getMenuConfiguration(
    @Param('spaceId') spaceId: string,
    @Param('configId') configId: string,
  ) {
    return this.spaceMenusService.getMenuConfiguration(spaceId, configId);
  }

  @Post()
  @ApiOperation({ summary: 'Save menu configuration for a space/config' })
  @ApiBody({ type: SaveSpaceMenuConfigurationDto })
  @ApiResponse({ status: 201, description: 'Configuration de menu enregistrée' })
  async saveMenuConfiguration(
    @Body() body: SaveSpaceMenuConfigurationDto,
  ) {
    return this.spaceMenusService.saveMenuConfiguration(body.spaceId, body.configId, body.menuItems);
  }
}
