import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

// Mapping des valeurs diet frontend → enum Diet Prisma
function mapDiet(diet: string[]): string[] {
  if (!diet?.length) return [];
  const map: Record<string, string> = {
    Vegan: 'Vegan',
    vegan: 'Vegan',
    'Végétarien': 'Vegetarian',
    Vegetarian: 'Vegetarian',
    vegetarian: 'Vegetarian',
    'Sans gluten': 'GlutenFree',
    GlutenFree: 'GlutenFree',
    glutenfree: 'GlutenFree',
    Halal: 'Halal',
    halal: 'Halal',
    Casher: 'Kosher',
    Kosher: 'Kosher',
    kosher: 'Kosher',
  };
  return diet.map(d => map[d] ?? null).filter(Boolean);
}

@Injectable()
export class MenuItemsService {
  private readonly logger = new Logger(MenuItemsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private cacheKey(tenantId: string, suffix = 'list') {
    return `menu-items:${tenantId}:${suffix}`;
  }

  private async invalidateCache(tenantId: string) {
    await this.redis.deletePattern(`datafriday:menu-items:${tenantId}:*`);
  }

  private readonly includeRelations = {
    productType: true,
    productCategory: true,
    components: {
      include: { component: true },
    },
    ingredients: {
      include: { ingredient: true },
    },
    packagings: {
      include: { packaging: true },
    },
    menuAssignments: {
      include: {
        station: {
          include: { config: true },
        },
      },
    },
  };

  private serializeItem(item: any) {
    const spaceIds: string[] = [];
    if (item.menuAssignments?.length) {
      for (const assignment of item.menuAssignments) {
        const spaceId = assignment.station?.config?.spaceId;
        if (spaceId && !spaceIds.includes(spaceId)) {
          spaceIds.push(spaceId);
        }
      }
    }
    const { menuAssignments, ...rest } = item;
    return { ...rest, spaceIds };
  }

  private toNumber(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private async getComponentUnitCost(componentId: string, tenantId: string) {
    const comp = await this.prisma.menuComponent.findFirst({
      where: { id: componentId, tenantId, deletedAt: null },
      select: { unitCost: true, storageType: true },
    });
    if (!comp) throw new BadRequestException(`Component ${componentId} not found`);
    return { unitCost: this.toNumber(comp.unitCost, 0), storageType: comp.storageType };
  }

  private async getIngredientUnitCost(ingredientId: string, tenantId: string) {
    const ing = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, tenantId, deletedAt: null },
      select: { costPerRecipeUnit: true, storageType: true },
    });
    if (!ing) throw new BadRequestException(`Ingredient ${ingredientId} not found`);
    return { unitCost: this.toNumber(ing.costPerRecipeUnit, 0), storageType: ing.storageType };
  }

  private async getPackagingUnitCost(packagingId: string, tenantId: string) {
    const p = await this.prisma.packaging.findFirst({
      where: { id: packagingId, tenantId, deletedAt: null },
      select: { costPerRecipeUnit: true, storageType: true },
    });
    if (!p) throw new BadRequestException(`Packaging ${packagingId} not found`);
    return { unitCost: this.toNumber(p.costPerRecipeUnit, 0), storageType: p.storageType };
  }

  async create(dto: CreateMenuItemDto, tenantId: string) {
    this.logger.log(`Creating menu item "${dto.name}" for tenant ${tenantId}`);
    try {
      const componentsLines = Array.isArray((dto as any).components) ? (dto as any).components : undefined;
      const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
      const packagingsLines = Array.isArray((dto as any).packagings) ? (dto as any).packagings : undefined;

      const item = await this.prisma.menuItem.create({
        data: {
          tenantId,
          name: dto.name,
          typeId: dto.typeId,
          categoryId: dto.categoryId,
          basePrice: dto.basePrice,
          totalCost: dto.totalCost,
          margin: dto.margin,
          description: dto.description,
          picture: dto.picture,
          allergens: dto.allergens || [],
          diet: mapDiet(dto.diet || []) as any[],
          storageType: (dto.storageType || []) as any[],
          readyForSale: dto.readyForSale,
          comboItem: dto.comboItem,
          numberOfPiecesRecipe: dto.numberOfPiecesRecipe,
          componentsData: dto.componentsData,

          ...(componentsLines
            ? {
                components: {
                  create: componentsLines.map((l: any) => ({
                    componentId: l.componentId,
                    numberOfUnits: this.toNumber(l.numberOfUnits),
                  })),
                },
              }
            : {}),

          ...(ingredientsLines
            ? {
                ingredients: {
                  create: ingredientsLines.map((l: any) => ({
                    ingredientId: l.ingredientId,
                    numberOfUnits: this.toNumber(l.numberOfUnits),
                  })),
                },
              }
            : {}),

          ...(packagingsLines
            ? {
                packagings: {
                  create: packagingsLines.map((l: any) => ({
                    packagingId: l.packagingId,
                    numberOfUnits: this.toNumber(l.numberOfUnits),
                  })),
                },
              }
            : {}),
        } as any,
        include: this.includeRelations,
      });
      this.logger.log(`Menu item created: ${item.id}`);

      if (componentsLines || ingredientsLines || packagingsLines) {
        await this.refreshCosts(tenantId, { itemIds: [item.id] });
      }

      await this.invalidateCache(tenantId);
      const refreshed = await this.findOne(item.id, tenantId);
      return refreshed;
    } catch (error) {
      this.logger.error(`Failed to create menu item: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching menu items for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const cacheKey = this.cacheKey(tenantId, `list:${page}:${limit}`);
      return this.redis.getOrSet(cacheKey, async () => {
        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
          this.prisma.menuItem.findMany({
            where: { tenantId, deletedAt: null },
            orderBy: { name: 'asc' },
            include: this.includeRelations,
            skip,
            take: limit,
          }),
          this.prisma.menuItem.count({ where: { tenantId, deletedAt: null } }),
        ]);
        this.logger.log(`Found ${items.length}/${total} menu items`);
        return {
          data: items.map(i => this.serializeItem(i)),
          meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
      }, { ttl: 60 });
    } catch (error) {
      this.logger.error(`Failed to fetch menu items: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching menu item ${id} for tenant ${tenantId}`);
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.includeRelations,
    });
    if (!item) {
      this.logger.warn(`Menu item ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }
    return this.serializeItem(item);
  }

  async update(id: string, dto: UpdateMenuItemDto, tenantId: string) {
    this.logger.log(`Updating menu item ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.typeId !== undefined) updateData.typeId = dto.typeId;
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId;
    if (dto.basePrice !== undefined) updateData.basePrice = dto.basePrice;
    if (dto.totalCost !== undefined) updateData.totalCost = dto.totalCost;
    if (dto.margin !== undefined) updateData.margin = dto.margin;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.picture !== undefined) updateData.picture = dto.picture;
    if (dto.allergens !== undefined) updateData.allergens = dto.allergens;
    if (dto.diet !== undefined) updateData.diet = mapDiet(dto.diet) as any[];
    if (dto.storageType !== undefined) updateData.storageType = dto.storageType as any[];
    if (dto.readyForSale !== undefined) updateData.readyForSale = dto.readyForSale;
    if (dto.comboItem !== undefined) updateData.comboItem = dto.comboItem;
    if (dto.numberOfPiecesRecipe !== undefined) updateData.numberOfPiecesRecipe = dto.numberOfPiecesRecipe;
    if (dto.componentsData !== undefined) updateData.componentsData = dto.componentsData;

    const componentsLines = Array.isArray((dto as any).components) ? (dto as any).components : undefined;
    const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
    const packagingsLines = Array.isArray((dto as any).packagings) ? (dto as any).packagings : undefined;

    if (componentsLines) {
      updateData.components = {
        deleteMany: {},
        create: componentsLines.map((l: any) => ({
          componentId: l.componentId,
          numberOfUnits: this.toNumber(l.numberOfUnits),
        })),
      };
    }
    if (ingredientsLines) {
      updateData.ingredients = {
        deleteMany: {},
        create: ingredientsLines.map((l: any) => ({
          ingredientId: l.ingredientId,
          numberOfUnits: this.toNumber(l.numberOfUnits),
        })),
      };
    }
    if (packagingsLines) {
      updateData.packagings = {
        deleteMany: {},
        create: packagingsLines.map((l: any) => ({
          packagingId: l.packagingId,
          numberOfUnits: this.toNumber(l.numberOfUnits),
        })),
      };
    }

    try {
      const item = await this.prisma.menuItem.update({
        where: { id },
        data: updateData,
        include: this.includeRelations,
      });
      this.logger.log(`Menu item ${id} updated`);

      if (componentsLines || ingredientsLines || packagingsLines) {
        await this.refreshCosts(tenantId, { itemIds: [id] });
      }

      await this.invalidateCache(tenantId);
      return this.findOne(id, tenantId);
    } catch (error) {
      this.logger.error(`Failed to update menu item ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async replaceComponents(menuItemId: string, components: CreateMenuItemDto['components'], tenantId: string) {
    this.logger.log(`Replacing components for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.findOne(menuItemId, tenantId);
    const lines = Array.isArray(components) ? components : [];

    await this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        components: {
          deleteMany: {},
          create: lines.map((l: any) => ({
            componentId: l.componentId,
            numberOfUnits: this.toNumber(l.numberOfUnits),
          })),
        },
      },
    });

    await this.refreshCosts(tenantId, { itemIds: [menuItemId] });
    await this.invalidateCache(tenantId);
    return this.findOne(menuItemId, tenantId);
  }

  async replaceIngredients(menuItemId: string, ingredients: CreateMenuItemDto['ingredients'], tenantId: string) {
    this.logger.log(`Replacing ingredients for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.findOne(menuItemId, tenantId);
    const lines = Array.isArray(ingredients) ? ingredients : [];

    await this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        ingredients: {
          deleteMany: {},
          create: lines.map((l: any) => ({
            ingredientId: l.ingredientId,
            numberOfUnits: this.toNumber(l.numberOfUnits),
          })),
        },
      },
    });

    await this.refreshCosts(tenantId, { itemIds: [menuItemId] });
    await this.invalidateCache(tenantId);
    return this.findOne(menuItemId, tenantId);
  }

  async replacePackagings(menuItemId: string, packagings: CreateMenuItemDto['packagings'], tenantId: string) {
    this.logger.log(`Replacing packagings for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.findOne(menuItemId, tenantId);
    const lines = Array.isArray(packagings) ? packagings : [];

    await this.prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        packagings: {
          deleteMany: {},
          create: lines.map((l: any) => ({
            packagingId: l.packagingId,
            numberOfUnits: this.toNumber(l.numberOfUnits),
          })),
        },
      },
    });

    await this.refreshCosts(tenantId, { itemIds: [menuItemId] });
    await this.invalidateCache(tenantId);
    return this.findOne(menuItemId, tenantId);
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Soft-deleting menu item ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);
    try {
      const result = await this.prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });
      this.logger.log(`Menu item ${id} soft-deleted`);
      await this.invalidateCache(tenantId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu item ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async refreshCosts(tenantId: string, opts?: { itemIds?: string[] }) {
    const itemIds = opts?.itemIds;
    this.logger.log(`Refreshing menu item costs for tenant ${tenantId}${itemIds?.length ? ` (ids=${itemIds.length})` : ''}...`);
    try {
      const items = await this.prisma.menuItem.findMany({
        where: {
          tenantId,
          deletedAt: null,
          ...(itemIds?.length ? { id: { in: itemIds } } : {}),
        },
        include: {
          components: { include: { component: true } },
          ingredients: { include: { ingredient: true } },
          packagings: { include: { packaging: true } },
        },
      });

      // P1: Batch load all costs in 3 queries instead of N queries
      const [allComponents, allIngredients, allPackagings] = await Promise.all([
        this.prisma.menuComponent.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, unitCost: true, storageType: true },
        }),
        this.prisma.ingredient.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, costPerRecipeUnit: true, storageType: true },
        }),
        this.prisma.packaging.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, costPerRecipeUnit: true, storageType: true },
        }),
      ]);

      // Create lookup maps for O(1) access
      const componentCostMap = new Map(
        allComponents.map(c => [c.id, { unitCost: this.toNumber(c.unitCost, 0), storageType: c.storageType }])
      );
      const ingredientCostMap = new Map(
        allIngredients.map(i => [i.id, { unitCost: this.toNumber(i.costPerRecipeUnit, 0), storageType: i.storageType }])
      );
      const packagingCostMap = new Map(
        allPackagings.map(p => [p.id, { unitCost: this.toNumber(p.costPerRecipeUnit, 0), storageType: p.storageType }])
      );

      let updated = 0;
      let updatedLines = 0;

      for (const item of items as any[]) {
        const tx: any[] = [];
        let totalCost = 0;

        for (const line of item.components || []) {
          const costData = componentCostMap.get(line.componentId);
          if (!costData) {
            this.logger.warn(`Component ${line.componentId} not found in cost map`);
            continue;
          }
          const { unitCost, storageType } = costData;
          const numberOfUnits = this.toNumber(line.numberOfUnits);
          const lineTotal = Math.round((unitCost * numberOfUnits) * 10000) / 10000;
          totalCost += lineTotal;
          tx.push(
            this.prisma.menuItemComponent.update({
              where: { id: line.id },
              data: { unitCost, totalCost: lineTotal, storageType: storageType || undefined },
            }),
          );
          updatedLines++;
        }

        for (const line of item.ingredients || []) {
          const costData = ingredientCostMap.get(line.ingredientId);
          if (!costData) {
            this.logger.warn(`Ingredient ${line.ingredientId} not found in cost map`);
            continue;
          }
          const { unitCost, storageType } = costData;
          const numberOfUnits = this.toNumber(line.numberOfUnits);
          const lineTotal = Math.round((unitCost * numberOfUnits) * 10000) / 10000;
          totalCost += lineTotal;
          tx.push(
            this.prisma.menuItemIngredient.update({
              where: { id: line.id },
              data: { unitCost, totalCost: lineTotal, storageType: storageType || undefined },
            }),
          );
          updatedLines++;
        }

        for (const line of item.packagings || []) {
          const costData = packagingCostMap.get(line.packagingId);
          if (!costData) {
            this.logger.warn(`Packaging ${line.packagingId} not found in cost map`);
            continue;
          }
          const { unitCost, storageType } = costData;
          const numberOfUnits = this.toNumber(line.numberOfUnits);
          const lineTotal = Math.round((unitCost * numberOfUnits) * 10000) / 10000;
          totalCost += lineTotal;
          tx.push(
            this.prisma.menuItemPackaging.update({
              where: { id: line.id },
              data: { unitCost, totalCost: lineTotal, storageType: storageType || undefined },
            }),
          );
          updatedLines++;
        }

        const margin = this.toNumber(item.basePrice) > 0
          ? ((this.toNumber(item.basePrice) - totalCost) / this.toNumber(item.basePrice)) * 100
          : null;

        tx.push(
          this.prisma.menuItem.update({
            where: { id: item.id },
            data: { totalCost, margin },
          }),
        );

        await this.prisma.$transaction(tx);
        updated++;
      }

      this.logger.log(`✅ P1: Refreshed costs for ${updated} menu items (${updatedLines} lines) with batch optimization`);
      await this.invalidateCache(tenantId);
      return { updated, total: items.length, updatedLines };
    } catch (error) {
      this.logger.error(`Failed to refresh costs: ${error.message}`, error.stack);
      throw error;
    }
  }

  // ── ProductType & ProductCategory ────────────────
  async getProductTypes() {
    return this.prisma.productType.findMany({ orderBy: { name: 'asc' }, include: { categories: true } });
  }

  async createProductType(name: string, tenantId?: string) {
    return this.prisma.productType.create({ data: { name, tenantId }, include: { categories: true } });
  }

  async getProductCategories(typeId?: string) {
    return this.prisma.productCategory.findMany({
      where: typeId ? { typeId } : undefined,
      orderBy: { name: 'asc' },
      include: { type: true },
    });
  }

  async createProductCategory(name: string, typeId: string, tenantId?: string) {
    return this.prisma.productCategory.create({ data: { name, typeId, tenantId }, include: { type: true } });
  }
}
