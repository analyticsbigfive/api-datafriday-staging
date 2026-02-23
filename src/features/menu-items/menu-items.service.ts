import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';

// Mapping des valeurs frontend libres → enum MenuItemCategory Prisma
function mapCategory(cat: string): string {
  if (!cat) return 'Beverage';
  const map: Record<string, string> = {
    drinks: 'Beverage',
    beverage: 'Beverage',
    Beverage: 'Beverage',
    food: 'Main',
    Food: 'Main',
    Main: 'Main',
    Starter: 'Starter',
    starter: 'Starter',
    Dessert: 'Dessert',
    dessert: 'Dessert',
    Side: 'Side',
    side: 'Side',
    Snack: 'Snack',
    snack: 'Snack',
    merch: 'Snack',
    other: 'Snack',
    Other: 'Snack',
  };
  return map[cat] ?? 'Snack';
}

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

  constructor(private prisma: PrismaService) {}

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

  async create(dto: CreateMenuItemDto, tenantId: string) {
    this.logger.log(`Creating menu item "${dto.name}" for tenant ${tenantId}`);
    try {
      const item = await this.prisma.menuItem.create({
        data: {
          tenantId,
          name: dto.name,
          type: dto.type,
          typeId: dto.typeId,
          category: mapCategory(dto.category) as any,
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
        },
        include: this.includeRelations,
      });
      this.logger.log(`Menu item created: ${item.id}`);
      return this.serializeItem(item);
    } catch (error) {
      this.logger.error(`Failed to create menu item: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching menu items for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        this.prisma.menuItem.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
          include: this.includeRelations,
          skip,
          take: limit,
        }),
        this.prisma.menuItem.count({ where: { tenantId } }),
      ]);
      this.logger.log(`Found ${items.length}/${total} menu items`);
      return {
        data: items.map(i => this.serializeItem(i)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch menu items: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching menu item ${id} for tenant ${tenantId}`);
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId },
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
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.typeId !== undefined) updateData.typeId = dto.typeId;
    if (dto.category !== undefined) updateData.category = mapCategory(dto.category) as any;
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

    try {
      const item = await this.prisma.menuItem.update({
        where: { id },
        data: updateData,
        include: this.includeRelations,
      });
      this.logger.log(`Menu item ${id} updated`);
      return this.serializeItem(item);
    } catch (error) {
      this.logger.error(`Failed to update menu item ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting menu item ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);
    try {
      const result = await this.prisma.menuItem.delete({ where: { id } });
      this.logger.log(`Menu item ${id} deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu item ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async refreshCosts(tenantId: string) {
    this.logger.log(`Refreshing menu item costs for tenant ${tenantId}...`);
    try {
      const items = await this.prisma.menuItem.findMany({
        where: { tenantId },
        include: {
          components: { include: { component: true } },
          ingredients: { include: { ingredient: true } },
          packagings: { include: { packaging: true } },
        },
      });

      // Calculate costs in memory, then batch update in a single transaction
      const updates: { id: string; totalCost: number; margin: number | null }[] = [];

      for (const item of items) {
        let totalCost = 0;

        for (const mic of (item as any).components || []) {
          totalCost += Number(mic.totalCost || 0);
        }
        for (const mii of (item as any).ingredients || []) {
          totalCost += Number(mii.totalCost || 0);
        }
        for (const mip of (item as any).packagings || []) {
          totalCost += Number(mip.totalCost || 0);
        }

        if (totalCost > 0) {
          const margin = Number(item.basePrice) > 0
            ? ((Number(item.basePrice) - totalCost) / Number(item.basePrice)) * 100
            : null;
          updates.push({ id: item.id, totalCost, margin });
        }
      }

      // Batch update in a single transaction (much faster than N individual updates)
      if (updates.length > 0) {
        await this.prisma.$transaction(
          updates.map(u =>
            this.prisma.menuItem.update({
              where: { id: u.id },
              data: { totalCost: u.totalCost, margin: u.margin },
            }),
          ),
        );
      }

      this.logger.log(`Refreshed costs for ${updates.length} menu items`);
      return { updated: updates.length, total: items.length };
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
