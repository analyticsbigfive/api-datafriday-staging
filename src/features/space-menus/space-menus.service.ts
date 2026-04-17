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
                // Components with their details
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
                        // Nested ingredients in components
                        ingredients: {
                          select: {
                            id: true,
                            quantity: true,
                            unitCost: true,
                            cost: true,
                            ingredient: {
                              select: {
                                id: true,
                                name: true,
                                unit: true,
                                unitCost: true,
                                storageType: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                // Direct ingredients
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
                        unit: true,
                        unitCost: true,
                        storageType: true,
                      },
                    },
                  },
                },
                // Packagings
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
                        unit: true,
                        unitCost: true,
                        storageType: true,
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

    // Transform the data to a cleaner format
    const menuItems = (shop as any).menuAssignments.map((assignment: any) => ({
      ...assignment.menuItem,
      enabled: assignment.enabled,
      // Transform components to include nested structure
      components: assignment.menuItem.components.map((comp: any) => ({
        id: comp.id,
        numberOfUnits: comp.numberOfUnits,
        unitCost: Number(comp.unitCost || 0),
        totalCost: Number(comp.totalCost || 0),
        storageType: comp.storageType,
        component: {
          ...comp.component,
          unitCost: Number(comp.component.unitCost || 0),
          ingredients: comp.component.ingredients.map((ing: any) => ({
            id: ing.id,
            quantity: ing.quantity,
            unitCost: Number(ing.unitCost || 0),
            cost: Number(ing.cost || 0),
            ingredient: {
              ...ing.ingredient,
              unitCost: Number(ing.ingredient.unitCost || 0),
            },
          })),
        },
      })),
      // Transform direct ingredients
      ingredients: assignment.menuItem.ingredients.map((ing: any) => ({
        id: ing.id,
        numberOfUnits: ing.numberOfUnits,
        unitCost: Number(ing.unitCost || 0),
        totalCost: Number(ing.totalCost || 0),
        storageType: ing.storageType,
        ingredient: {
          ...ing.ingredient,
          unitCost: Number(ing.ingredient.unitCost || 0),
        },
      })),
      // Transform packagings
      packagings: assignment.menuItem.packagings.map((pack: any) => ({
        id: pack.id,
        numberOfUnits: pack.numberOfUnits,
        unitCost: Number(pack.unitCost || 0),
        totalCost: Number(pack.totalCost || 0),
        storageType: pack.storageType,
        packaging: {
          ...pack.packaging,
          unitCost: Number(pack.packaging.unitCost || 0),
        },
      })),
      // Convert Decimal to number for prices
      basePrice: Number(assignment.menuItem.basePrice),
      totalCost: Number(assignment.menuItem.totalCost || 0),
    }));

    return {
      shopId: shop.id,
      shopName: shop.name,
      shopType: shop.type,
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
