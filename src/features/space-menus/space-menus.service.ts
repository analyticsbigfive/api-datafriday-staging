import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class SpaceMenusService {
  private readonly logger = new Logger(SpaceMenusService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all menu items assigned to a shop (SpaceElement)
   * Returns shop info + all menu items with their ingredients, components, and packagings
   */
  async getShopMenu(shopId: string, tenantId: string) {
    this.logger.log(`Getting shop menu for shopId=${shopId} tenantId=${tenantId}`);

    // Get the shop (SpaceElement) with its menu assignments
    const shop = await this.prisma.spaceElement.findFirst({
      where: {
        id: shopId,
        OR: [
          { floor: { config: { space: { tenantId } } } },
          { forecourt: { config: { space: { tenantId } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        notes: true,
        image: true,
        attributes: true,
        shopTypes: true,
        menuAssignments: {
          select: {
            menuItemId: true,
            enabled: true,
            menuItem: {
              select: {
                id: true,
                name: true,
                basePrice: true,
                totalCost: true,
                margin: true,
                description: true,
                picture: true,
                diet: true,
                allergens: true,
                storageType: true,
                readyForSale: true,
                comboItem: true,
                numberOfPiecesRecipe: true,
                productType: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                productCategory: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                // Components with their details (MenuItemComponent)
                components: {
                  select: {
                    id: true,
                    numberOfUnits: true,
                    unitCost: true,
                    totalCost: true,
                    storageType: true,
                    component: {
                      select: {
                        id: true,
                        name: true,
                        unit: true,
                        unitCost: true,
                        storageType: true,
                        category: true,
                        allergens: true,
                        description: true,
                        componentCategory: true,
                        numberOfUnitsRecipe: true,
                        // Nested ingredients in components (ComponentIngredient)
                        ingredients: {
                          select: {
                            id: true,
                            quantity: true,
                            unit: true,
                            unitCost: true,
                            cost: true,
                            ingredient: {
                              select: {
                                id: true,
                                name: true,
                                recipeUnit: true,
                                purchaseUnit: true,
                                costPerRecipeUnit: true,
                                costPerPurchaseUnit: true,
                                storageType: true,
                                ingredientCategory: true,
                                supplier: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                // Direct ingredients (MenuItemIngredient)
                ingredients: {
                  select: {
                    id: true,
                    numberOfUnits: true,
                    unitCost: true,
                    totalCost: true,
                    storageType: true,
                    ingredient: {
                      select: {
                        id: true,
                        name: true,
                        recipeUnit: true,
                        purchaseUnit: true,
                        costPerRecipeUnit: true,
                        costPerPurchaseUnit: true,
                        storageType: true,
                        ingredientCategory: true,
                        supplier: true,
                      },
                    },
                  },
                },
                // Packagings (MenuItemPackaging)
                packagings: {
                  select: {
                    id: true,
                    numberOfUnits: true,
                    unitCost: true,
                    totalCost: true,
                    storageType: true,
                    packaging: {
                      select: {
                        id: true,
                        name: true,
                        recipeUnit: true,
                        purchaseUnit: true,
                        costPerRecipeUnit: true,
                        costPerPurchaseUnit: true,
                        storageType: true,
                        supplier: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as any);

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${shopId} not found`);
    }

    const shopAny = shop as any;

    // Transform the data to a cleaner format
    const menuItems = shopAny.menuAssignments.map((assignment: any) => {
      const mi = assignment.menuItem;
      return {
        id: mi.id,
        name: mi.name,
        description: mi.description,
        picture: mi.picture,
        basePrice: Number(mi.basePrice || 0),
        totalCost: Number(mi.totalCost || 0),
        margin: mi.margin,
        diet: mi.diet || [],
        allergens: mi.allergens || [],
        storageType: mi.storageType || [],
        readyForSale: mi.readyForSale,
        comboItem: mi.comboItem,
        numberOfPiecesRecipe: mi.numberOfPiecesRecipe,
        enabled: assignment.enabled,
        productType: mi.productType,
        productCategory: mi.productCategory,

        // Components with nested ingredients
        components: (mi.components || []).map((comp: any) => ({
          id: comp.id,
          numberOfUnits: comp.numberOfUnits,
          unitCost: Number(comp.unitCost || 0),
          totalCost: Number(comp.totalCost || 0),
          storageType: comp.storageType,
          component: {
            id: comp.component.id,
            name: comp.component.name,
            unit: comp.component.unit,
            unitCost: Number(comp.component.unitCost || 0),
            storageType: comp.component.storageType,
            category: comp.component.category,
            componentCategory: comp.component.componentCategory,
            allergens: comp.component.allergens || [],
            description: comp.component.description,
            numberOfUnitsRecipe: comp.component.numberOfUnitsRecipe,
            ingredients: (comp.component.ingredients || []).map((ing: any) => ({
              id: ing.id,
              quantity: ing.quantity,
              unit: ing.unit,
              unitCost: Number(ing.unitCost || 0),
              cost: Number(ing.cost || 0),
              ingredient: {
                id: ing.ingredient.id,
                name: ing.ingredient.name,
                recipeUnit: ing.ingredient.recipeUnit,
                purchaseUnit: ing.ingredient.purchaseUnit,
                costPerRecipeUnit: Number(ing.ingredient.costPerRecipeUnit || 0),
                costPerPurchaseUnit: Number(ing.ingredient.costPerPurchaseUnit || 0),
                storageType: ing.ingredient.storageType,
                ingredientCategory: ing.ingredient.ingredientCategory,
                supplier: ing.ingredient.supplier,
              },
            })),
          },
        })),

        // Direct ingredients
        ingredients: (mi.ingredients || []).map((ing: any) => ({
          id: ing.id,
          numberOfUnits: ing.numberOfUnits,
          unitCost: Number(ing.unitCost || 0),
          totalCost: Number(ing.totalCost || 0),
          storageType: ing.storageType,
          ingredient: {
            id: ing.ingredient.id,
            name: ing.ingredient.name,
            recipeUnit: ing.ingredient.recipeUnit,
            purchaseUnit: ing.ingredient.purchaseUnit,
            costPerRecipeUnit: Number(ing.ingredient.costPerRecipeUnit || 0),
            costPerPurchaseUnit: Number(ing.ingredient.costPerPurchaseUnit || 0),
            storageType: ing.ingredient.storageType,
            ingredientCategory: ing.ingredient.ingredientCategory,
            supplier: ing.ingredient.supplier,
          },
        })),

        // Packagings
        packagings: (mi.packagings || []).map((pack: any) => ({
          id: pack.id,
          numberOfUnits: pack.numberOfUnits,
          unitCost: Number(pack.unitCost || 0),
          totalCost: Number(pack.totalCost || 0),
          storageType: pack.storageType,
          packaging: {
            id: pack.packaging.id,
            name: pack.packaging.name,
            recipeUnit: pack.packaging.recipeUnit,
            purchaseUnit: pack.packaging.purchaseUnit,
            costPerRecipeUnit: Number(pack.packaging.costPerRecipeUnit || 0),
            costPerPurchaseUnit: Number(pack.packaging.costPerPurchaseUnit || 0),
            storageType: pack.packaging.storageType,
            supplier: pack.packaging.supplier,
          },
        })),
      };
    });

    return {
      shopId: shopAny.id,
      shopName: shopAny.name,
      shopType: shopAny.type,
      shopSubTypes: shopAny.shopTypes || [],
      notes: shopAny.notes,
      image: shopAny.image,
      attributes: shopAny.attributes,
      menuItems,
    };
  }

  /**
   * Get menu assignments for all elements in a config
   * Returns { [elementId]: { [menuItemId]: boolean } }
   */
  async getMenuConfiguration(spaceId: string, configId: string) {
    this.logger.log(`Getting menu config for space=${spaceId} config=${configId}`);

    // Get all elements belonging to floors/forecourt of this config
    const elements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { configId } },
          { forecourt: { configId } },
        ],
      },
      select: {
        id: true,
        menuAssignments: {
          select: { menuItemId: true, enabled: true },
        },
      },
    } as any);

    // Build the { elementId: { menuItemId: boolean } } map
    const menuItems: Record<string, Record<string, boolean>> = {};
    for (const el of elements) {
      if ((el as any).menuAssignments?.length) {
        menuItems[el.id] = {};
        for (const a of (el as any).menuAssignments) {
          menuItems[el.id][a.menuItemId] = a.enabled;
        }
      }
    }

    return { spaceId, configId, menuItems };
  }

  /**
   * Save menu assignments for elements in a config
   * Input: { [elementId]: { [menuItemId]: boolean } }
   */
  async saveMenuConfiguration(spaceId: string, configId: string, menuItems: Record<string, Record<string, boolean>>) {
    this.logger.log(`Saving menu config for space=${spaceId} config=${configId}`);

    await this.prisma.$transaction(async (tx) => {
      // For each element, upsert menu assignments
      for (const [elementId, items] of Object.entries(menuItems)) {
        for (const [menuItemId, enabled] of Object.entries(items)) {
          await (tx as any).menuAssignment.upsert({
            where: { elementId_menuItemId: { elementId, menuItemId } },
            create: { elementId, menuItemId, enabled },
            update: { enabled },
          });
        }

        // Remove assignments for menu items not in the map
        const activeMenuItemIds = Object.keys(items);
        if (activeMenuItemIds.length) {
          await (tx as any).menuAssignment.deleteMany({
            where: {
              elementId,
              menuItemId: { notIn: activeMenuItemIds },
            },
          });
        }
      }
    });

    return this.getMenuConfiguration(spaceId, configId);
  }
}
