import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
    brand: true,
    displayName: true,
    components: {
      include: { component: true },
    },
    ingredients: {
      include: { ingredient: { include: { marketPrice: true } } },
    },
    packagings: {
      include: { packaging: { include: { marketPrice: true } } },
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
    // Collect spaceIds from direct field first, then enrich with menuAssignments-derived ones
    const directSpaceIds: string[] = Array.isArray(item.spaceIds) ? item.spaceIds : [];
    const assignmentSpaceIds: string[] = [];
    if (item.menuAssignments?.length) {
      for (const assignment of item.menuAssignments) {
        const spaceId = assignment.station?.config?.spaceId;
        if (spaceId && !assignmentSpaceIds.includes(spaceId)) {
          assignmentSpaceIds.push(spaceId);
        }
      }
    }
    // Merge: direct field is source of truth, assignment-derived ones are added if missing
    const mergedSpaceIds = [...directSpaceIds];
    for (const sid of assignmentSpaceIds) {
      if (!mergedSpaceIds.includes(sid)) mergedSpaceIds.push(sid);
    }
    const { menuAssignments, ...rest } = item;
    return { ...rest, spaceIds: mergedSpaceIds };
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
    this.logger.debug(`Validating IDs - typeId: ${dto.typeId}, categoryId: ${dto.categoryId}`);
    
    try {
      const componentsLines = Array.isArray((dto as any).components) ? (dto as any).components : undefined;
      const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
      const packagingsLines = Array.isArray((dto as any).packagings) ? (dto as any).packagings : undefined;
      
      if (ingredientsLines) {
        this.logger.debug(`Ingredient IDs: ${ingredientsLines.map((i: any) => i.ingredientId).join(', ')}`);
      }
      if (packagingsLines) {
        this.logger.debug(`Packaging IDs: ${packagingsLines.map((p: any) => p.packagingId).join(', ')}`);
      }
      if (componentsLines) {
        this.logger.debug(`Component IDs: ${componentsLines.map((c: any) => c.componentId).join(', ')}`);
      }

      const item = await this.prisma.menuItem.create({
        data: {
          tenantId,
          name: dto.name,
          typeId: dto.typeId || null,
          categoryId: dto.categoryId || null,
          brandId: dto.brandId || null,
          displayNameId: dto.displayNameId || null,
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
          inventoryPackagingType: (dto as any).inventoryPackagingType ?? null,
          inventoryNumberOfUnits: (dto as any).inventoryNumberOfUnits ?? null,
          spaceIds: Array.isArray((dto as any).spaceIds) ? (dto as any).spaceIds : [],
          spacePrices: (dto as any).spacePrices ?? null,

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
      if (error.code === 'P2003') {
        const fieldName = error.meta?.field_name || 'unknown field';
        this.logger.error(`Foreign key constraint failed on: ${fieldName}`);
        throw new BadRequestException(
          `Invalid ID provided. Foreign key constraint failed on: ${fieldName}. ` +
          `Please verify that the typeId, categoryId, componentId, ingredientId, or packagingId exists in the database.`
        );
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A menu item with this name already exists`);
      }
      throw error;
    }
  }

  async bulkCreate(dtos: CreateMenuItemDto[], tenantId: string) {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      return { count: 0, items: [] };
    }

    this.logger.log(`Bulk creating ${dtos.length} menu items for tenant ${tenantId}`);
    try {
      const items = dtos.map((dto) => ({
        id: randomUUID(),
        tenantId,
        name: dto.name,
        typeId: dto.typeId || null,
        categoryId: dto.categoryId || null,
        brandId: dto.brandId || null,
        displayNameId: dto.displayNameId || null,
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
        inventoryPackagingType: (dto as any).inventoryPackagingType ?? null,
        inventoryNumberOfUnits: (dto as any).inventoryNumberOfUnits ?? null,
      }));

      await this.prisma.menuItem.createMany({
        data: items as any[],
      });

      await this.invalidateCache(tenantId);
      return {
        count: items.length,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          typeId: item.typeId,
          categoryId: item.categoryId,
          basePrice: item.basePrice,
          tenantId: item.tenantId,
          spaceIds: [],
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to bulk create menu items: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const fieldName = error.meta?.field_name || 'unknown field';
        throw new BadRequestException(`Invalid ID provided. Foreign key constraint failed on: ${fieldName}.`);
      }
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

  // ── Recette / réarmement plats composés ──────────────────────────────────
  // Endpoint DÉDIÉ (GET /menu-items/:id/recipe + POST /menu-items/recipes).
  // Ne touche PAS au `components` de /menu-items (= MenuItemComponent[]) → aucune
  // régression éditeur de recettes / /space-menus / DTO create-update / Swagger.
  // Voir docs/recipe-endpoint.api.md.
  private readonly recipeInclude = {
    components: { include: { component: true } },
    ingredients: { include: { ingredient: { include: { marketPrice: true } } } },
    packagings: { include: { packaging: { include: { marketPrice: true } } } },
  };

  /** Normalise vers 'Yes'/'No' (casse/oui-non/booléen). null/'' restent null. */
  private normYesNo(value: unknown): 'Yes' | 'No' | null {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    const s = String(value ?? '').trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === 'oui' || s === '1') return 'Yes';
    if (s === 'no' || s === 'false' || s === 'non' || s === '0') return 'No';
    return null;
  }

  /** category détectable comme packaging par le front (isPackagingComponent). */
  private isPackagingCategory(category?: string | null) {
    const c = String(category ?? '').toLowerCase();
    return c.includes('packaging') || c.includes('emballage');
  }

  /** Coût de ligne : totalCost déjà calculé (refreshCosts) sinon unitCost × qty. */
  private lineCost(line: any) {
    const total = this.toNumber(line.totalCost, NaN);
    if (Number.isFinite(total)) return total;
    return Math.round(this.toNumber(line.unitCost) * this.toNumber(line.numberOfUnits) * 10000) / 10000;
  }

  /**
   * Fusionne les 3 relations (MenuItemIngredient + MenuItemComponent +
   * MenuItemPackaging) en un seul `components[]` dénormalisé au format contrat.
   * Résout `supplierId` inline via marketPrice (le front court-circuite ainsi le
   * join marketPrice→supplier). Collecte les supplierIds rencontrés.
   * NB: les MenuComponent (sous-recettes) sont retournés comme lignes terminales
   * (`itemType:'Component'`) ; le moteur front `expandMenuItemStock` recurse de
   * lui-même au niveau menu-items (pas d'aplatissement serveur superflu).
   */
  private buildRecipeComponents(item: any): { components: any[]; supplierIds: Set<string> } {
    const supplierIds = new Set<string>();
    const components: any[] = [];

    for (const line of item.ingredients || []) {
      const ing = line.ingredient || {};
      const mp = ing.marketPrice || null;
      const supplierId = mp?.supplierId || null;
      if (supplierId) supplierIds.add(supplierId);
      components.push({
        id: line.id,
        sourceId: line.ingredientId,
        name: ing.name ?? null,
        itemType: 'Ingredient',
        numberOfUnits: this.toNumber(line.numberOfUnits),
        unit: ing.recipeUnit ?? 'unit',
        category: ing.ingredientCategory ?? mp?.category ?? null,
        storageType: line.storageType ?? ing.storageType ?? null,
        marketPriceId: ing.marketPriceId ?? null,
        supplierId,
        cost: this.lineCost(line),
      });
    }

    for (const line of item.packagings || []) {
      const pkg = line.packaging || {};
      const mp = pkg.marketPrice || null;
      const supplierId = mp?.supplierId || null;
      if (supplierId) supplierIds.add(supplierId);
      // StorageType DB = Cold|Dry|Frozen (jamais 'material') → on s'appuie sur la
      // `category` pour la détection front, et on force storageType='material'
      // (contrat) pour fiabiliser isPackagingComponent.
      const category = this.isPackagingCategory(pkg.ingredientCategory)
        ? pkg.ingredientCategory
        : 'packaging';
      components.push({
        id: line.id,
        sourceId: line.packagingId,
        name: pkg.name ?? null,
        itemType: 'Packaging',
        numberOfUnits: this.toNumber(line.numberOfUnits),
        unit: pkg.recipeUnit ?? 'unit',
        category,
        storageType: 'material',
        marketPriceId: pkg.marketPriceId ?? null,
        supplierId,
        cost: this.lineCost(line),
      });
    }

    for (const line of item.components || []) {
      const comp = line.component || {};
      components.push({
        id: line.id,
        sourceId: line.componentId,
        name: comp.name ?? null,
        itemType: 'Component',
        numberOfUnits: this.toNumber(line.numberOfUnits),
        unit: comp.unit ?? 'unit',
        category: comp.category ?? null,
        storageType: line.storageType ?? comp.storageType ?? null,
        marketPriceId: null,
        supplierId: null,
        cost: this.lineCost(line),
      });
    }

    return { components, supplierIds };
  }

  /** Charge le dictionnaire fournisseurs (id, name, email, phone←tel, sites). */
  private async loadSuppliers(supplierIds: Set<string>, tenantId: string) {
    if (!supplierIds.size) return [];
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: [...supplierIds] }, tenantId },
      select: { id: true, name: true, email: true, tel: true, sites: true },
    });
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email ?? null,
      phone: s.tel ?? null,
      sites: s.sites ?? [],
    }));
  }

  private toRecipeDto(item: any, components: any[]) {
    return {
      id: item.id,
      name: item.name,
      readyForSale: this.normYesNo(item.readyForSale),
      comboItem: this.normYesNo(item.comboItem),
      numberOfPiecesRecipe: this.toNumber(item.numberOfPiecesRecipe, 1) || 1,
      cost: this.toNumber(item.totalCost, 0),
      components,
    };
  }

  async getRecipe(id: string, tenantId: string) {
    this.logger.log(`Fetching recipe for menu item ${id} (tenant ${tenantId})`);
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.recipeInclude,
    });
    if (!item) throw new NotFoundException(`Menu item with ID ${id} not found`);
    const { components, supplierIds } = this.buildRecipeComponents(item);
    const suppliers = await this.loadSuppliers(supplierIds, tenantId);
    return { ...this.toRecipeDto(item, components), suppliers };
  }

  async getRecipes(ids: string[], tenantId: string) {
    const where: any = { tenantId, deletedAt: null };
    if (Array.isArray(ids) && ids.length) where.id = { in: ids };
    this.logger.log(`Fetching recipes for ${ids?.length ?? 'all'} menu item(s) (tenant ${tenantId})`);
    const items = await this.prisma.menuItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: this.recipeInclude,
    });
    const allSupplierIds = new Set<string>();
    const built = items.map((item) => {
      const { components, supplierIds } = this.buildRecipeComponents(item);
      supplierIds.forEach((s) => allSupplierIds.add(s));
      return this.toRecipeDto(item, components);
    });
    const suppliers = await this.loadSuppliers(allSupplierIds, tenantId);
    return { items: built, suppliers };
  }

  async update(id: string, dto: UpdateMenuItemDto, tenantId: string) {
    this.logger.log(`Updating menu item ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.typeId !== undefined) updateData.typeId = dto.typeId;
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId;
    if (dto.brandId !== undefined) updateData.brandId = dto.brandId || null;
    if (dto.displayNameId !== undefined) updateData.displayNameId = dto.displayNameId || null;
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
    if ((dto as any).inventoryPackagingType !== undefined) updateData.inventoryPackagingType = (dto as any).inventoryPackagingType;
    if ((dto as any).inventoryNumberOfUnits !== undefined) updateData.inventoryNumberOfUnits = (dto as any).inventoryNumberOfUnits;
    if ((dto as any).spaceIds !== undefined) updateData.spaceIds = Array.isArray((dto as any).spaceIds) ? (dto as any).spaceIds : [];
    if ((dto as any).spacePrices !== undefined) updateData.spacePrices = (dto as any).spacePrices ?? null;

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
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid typeId, categoryId, componentId, ingredientId, or packagingId provided`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu item with ID ${id} not found`);
      }
      throw error;
    }
  }

  async replaceComponents(menuItemId: string, components: CreateMenuItemDto['components'], tenantId: string) {
    this.logger.log(`Replacing components for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.findOne(menuItemId, tenantId);
    const lines = Array.isArray(components) ? components : [];

    try {
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
    } catch (error) {
      this.logger.error(`Failed to replace components for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid componentId in the provided list`);
      }
      throw error;
    }
  }

  async replaceIngredients(menuItemId: string, ingredients: CreateMenuItemDto['ingredients'], tenantId: string) {
    this.logger.log(`Replacing ingredients for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.findOne(menuItemId, tenantId);
    const lines = Array.isArray(ingredients) ? ingredients : [];

    try {
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
    } catch (error) {
      this.logger.error(`Failed to replace ingredients for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid ingredientId in the provided list`);
      }
      throw error;
    }
  }

  async replacePackagings(menuItemId: string, packagings: CreateMenuItemDto['packagings'], tenantId: string) {
    this.logger.log(`Replacing packagings for menu item ${menuItemId} (tenant ${tenantId})`);
    await this.findOne(menuItemId, tenantId);
    const lines = Array.isArray(packagings) ? packagings : [];

    try {
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
    } catch (error) {
      this.logger.error(`Failed to replace packagings for menu item ${menuItemId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid packagingId in the provided list`);
      }
      throw error;
    }
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
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu item with ID ${id} not found`);
      }
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
  async getProductTypes(tenantId: string) {
    return this.prisma.productType.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
      include: {
        categories: {
          where: { OR: [{ tenantId }, { tenantId: null }] },
        },
      },
    });
  }

  async createProductType(name: string, tenantId?: string) {
    return this.prisma.productType.create({ data: { name, tenantId }, include: { categories: true } });
  }

  async deleteProductType(id: string, tenantId: string) {
    const productType = await this.prisma.productType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productType) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    if (productType.tenantId === null) {
      throw new BadRequestException(`Cannot delete global product type`);
    }

    await this.prisma.productType.delete({ where: { id } });
    this.logger.log(`Product type ${id} deleted`);
  }

  async updateProductType(id: string, name: string, tenantId: string) {
    const productType = await this.prisma.productType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productType) {
      throw new NotFoundException(`Product type with ID ${id} not found`);
    }

    if (productType.tenantId === null) {
      throw new BadRequestException(`Cannot update global product type`);
    }

    const updated = await this.prisma.productType.update({
      where: { id },
      data: { name },
      include: { categories: true },
    });
    this.logger.log(`Product type ${id} updated`);
    return updated;
  }

  async getProductCategories(tenantId: string, typeId?: string) {
    return this.prisma.productCategory.findMany({
      where: {
        AND: [
          { OR: [{ tenantId }, { tenantId: null }] },
          ...(typeId ? [{ typeId }] : []),
        ],
      },
      orderBy: { name: 'asc' },
      include: { type: true },
    });
  }

  async createProductCategory(
    name: string,
    typeId?: string,
    tenantId?: string,
    productTypeId?: string,
  ) {
    const resolvedTypeId = typeId ?? productTypeId;

    if (!resolvedTypeId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              isNotEmpty: 'typeId should not be empty',
              isString: 'typeId must be a string',
            },
            messages: [
              'typeId should not be empty',
              'typeId must be a string',
            ],
            value: resolvedTypeId,
          },
        ],
      });
    }

    const productType = await this.prisma.productType.findFirst({
      where: {
        id: resolvedTypeId,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!productType) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              exists: 'typeId must reference an accessible product type',
            },
            messages: ['typeId must reference an accessible product type'],
            value: resolvedTypeId,
          },
        ],
      });
    }

    return this.prisma.productCategory.create({
      data: {
        name,
        tenantId,
        type: {
          connect: { id: resolvedTypeId },
        },
      },
      include: { type: true },
    });
  }

  async deleteProductCategory(id: string, tenantId: string) {
    const productCategory = await this.prisma.productCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productCategory) {
      throw new NotFoundException(`Product category with ID ${id} not found`);
    }

    if (productCategory.tenantId === null) {
      throw new BadRequestException(`Cannot delete global product category`);
    }

    await this.prisma.productCategory.delete({ where: { id } });
    this.logger.log(`Product category ${id} deleted`);
  }

  async updateProductCategory(
    id: string,
    data: { name?: string; typeId?: string; productTypeId?: string },
    tenantId: string,
  ) {
    const productCategory = await this.prisma.productCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });

    if (!productCategory) {
      throw new NotFoundException(`Product category with ID ${id} not found`);
    }

    if (productCategory.tenantId === null) {
      throw new BadRequestException(`Cannot update global product category`);
    }

    const resolvedTypeId = data.typeId ?? data.productTypeId;
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;

    if (resolvedTypeId !== undefined) {
      const productType = await this.prisma.productType.findFirst({
        where: { id: resolvedTypeId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!productType) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'typeId',
              constraints: {
                exists: 'typeId must reference an accessible product type',
              },
              messages: ['typeId must reference an accessible product type'],
              value: resolvedTypeId,
            },
          ],
        });
      }
      updateData.type = { connect: { id: resolvedTypeId } };
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: updateData,
      include: { type: true },
    });
    this.logger.log(`Product category ${id} updated`);
    return updated;
  }
}
