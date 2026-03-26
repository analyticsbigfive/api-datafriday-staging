import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMenuComponentDto } from './dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from './dto/update-menu-component.dto';

@Injectable()
export class MenuComponentsService {
  private readonly logger = new Logger(MenuComponentsService.name);

  constructor(private prisma: PrismaService) {}

  private toDecimalOrUndefined(value: unknown): any {
    if (value === null || value === undefined || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private uniqueStringList(values: unknown[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      if (typeof v !== 'string') continue;
      const id = v.trim();
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  private async assertIngredientsExist(ingredientIds: unknown[], tenantId: string) {
    const ids = this.uniqueStringList(ingredientIds);
    if (!ids.length) return;

    const found = await this.prisma.ingredient.findMany({
      where: {
        id: { in: ids },
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const foundIds = new Set(found.map((i) => i.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Unknown ingredient ID(s): ${missing.join(', ')}. ` +
        `Make sure these IDs belong to the "ingredients" table, not "market_prices". ` +
        `Use POST /market-prices/sync-ingredients to auto-create missing ingredients from market prices.`,
      );
    }
  }

  private async assertChildrenExist(childIds: unknown[], tenantId: string) {
    const ids = this.uniqueStringList(childIds);
    if (!ids.length) return;

    const found = await this.prisma.menuComponent.findMany({
      where: {
        id: { in: ids },
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const foundIds = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length) {
      throw new BadRequestException(`Invalid childId(s): ${missing.join(', ')}`);
    }
  }

  async replaceIngredients(
    componentId: string,
    ingredients: CreateMenuComponentDto['ingredients'],
    tenantId: string,
  ) {
    this.logger.log(`Replacing ingredient lines for component ${componentId} (tenant ${tenantId})`);
    await this.findOne(componentId, tenantId);

    const lines = Array.isArray(ingredients) ? ingredients : [];

    await this.assertIngredientsExist(
      lines.map((l: any) => l?.ingredientId),
      tenantId,
    );

    try {
      await this.prisma.menuComponent.update({
        where: { id: componentId },
        data: {
          ingredients: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              ingredientId: l.ingredientId,
              quantity: Number(l.quantity ?? l.numberOfUnits),
              unit: l.unit,
              unitCost: this.toDecimalOrUndefined((l as any).unitCost),
              cost: this.toDecimalOrUndefined((l as any).cost),
            })),
          },
        },
      });

      await this.refreshCosts(tenantId, { componentIds: [componentId] });
      return this.findOne(componentId, tenantId);
    } catch (error) {
      this.logger.error(`Failed to replace ingredients for component ${componentId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(field ? `Invalid reference: ${field}` : `Invalid ingredient ID in the provided list`);
      }
      throw error;
    }
  }

  async replaceChildren(
    componentId: string,
    children: CreateMenuComponentDto['children'],
    tenantId: string,
  ) {
    this.logger.log(`Replacing child component lines for component ${componentId} (tenant ${tenantId})`);
    await this.findOne(componentId, tenantId);

    const lines = Array.isArray(children) ? children : [];

    await this.assertChildrenExist(
      lines.map((l: any) => l?.childId),
      tenantId,
    );

    try {
      await this.prisma.menuComponent.update({
        where: { id: componentId },
        data: {
          children: {
            deleteMany: {},
            create: lines.map((l: any) => ({
              childId: l.childId,
              quantity: Number(l.quantity),
              unit: l.unit,
              cost: this.toDecimalOrUndefined((l as any).cost),
            })),
          },
        },
      });

      await this.refreshCosts(tenantId, { componentIds: [componentId] });
      return this.findOne(componentId, tenantId);
    } catch (error) {
      this.logger.error(`Failed to replace children for component ${componentId}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(field ? `Invalid reference: ${field}` : `Invalid child component ID in the provided list`);
      }
      throw error;
    }
  }

  private async resolveIngredientUnitCost(ingredientId: string, tenantId: string): Promise<number> {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id: ingredientId, tenantId, deletedAt: null },
      select: { costPerRecipeUnit: true },
    });
    if (!ingredient) throw new BadRequestException(`Ingredient ${ingredientId} not found`);
    return Number(ingredient.costPerRecipeUnit || 0);
  }

  private async computeComponentUnitCost(componentId: string, tenantId: string, stack: string[] = []): Promise<number> {
    if (stack.includes(componentId)) {
      throw new BadRequestException(`Cycle detected in components: ${[...stack, componentId].join(' -> ')}`);
    }

    const component = await this.prisma.menuComponent.findFirst({
      where: { id: componentId, tenantId, deletedAt: null },
      include: {
        ingredients: true,
        children: true,
      },
    });
    if (!component) throw new BadRequestException(`MenuComponent ${componentId} not found`);

    const nextStack = [...stack, componentId];

    let total = 0;
    for (const line of component.ingredients || []) {
      const unitCost = Number(line.unitCost || 0) || (await this.resolveIngredientUnitCost(line.ingredientId, tenantId));
      total += unitCost * (Number(line.quantity) || 0);
    }

    for (const childLine of component.children || []) {
      const childUnitCost = await this.computeComponentUnitCost(childLine.childId, tenantId, nextStack);
      total += childUnitCost * (Number(childLine.quantity) || 0);
    }

    return Math.round(total * 10000) / 10000;
  }

  private readonly includeRelations = {
    ingredients: {
      include: { ingredient: true },
    },
    children: {
      include: { child: true },
    },
    parents: {
      include: { parent: true },
    },
  };

  async create(dto: CreateMenuComponentDto, tenantId: string) {
    this.logger.log(`Creating menu component "${dto.name}" for tenant ${tenantId}`);
    try {
      const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
      const childrenLines = Array.isArray((dto as any).children) ? (dto as any).children : undefined;

      await Promise.all([
        this.assertIngredientsExist(
          (ingredientsLines || []).map((l: any) => l?.ingredientId),
          tenantId,
        ),
        this.assertChildrenExist(
          (childrenLines || []).map((l: any) => l?.childId),
          tenantId,
        ),
      ]);

      const component = await this.prisma.menuComponent.create({
        data: {
          tenantId,
          name: dto.name,
          unit: dto.unit,
          category: dto.category,
          unitCost: dto.unitCost,
          allergens: dto.allergens || [],
          description: dto.description,
          storageType: dto.storageType as any,
          subComponents: dto.subComponents,
          componentCategory: dto.componentCategory,
          numberOfUnitsRecipe: dto.numberOfUnitsRecipe,

          ...(ingredientsLines
            ? {
                ingredients: {
                  create: ingredientsLines.map((l: any) => ({
                    ingredientId: l.ingredientId,
                    quantity: Number(l.quantity ?? l.numberOfUnits),
                    unit: l.unit,
                    unitCost: this.toDecimalOrUndefined(l.unitCost),
                    cost: this.toDecimalOrUndefined(l.cost),
                  })),
                },
              }
            : {}),

          ...(childrenLines
            ? {
                children: {
                  create: childrenLines.map((l: any) => ({
                    childId: l.childId,
                    quantity: Number(l.quantity),
                    unit: l.unit,
                    cost: this.toDecimalOrUndefined(l.cost),
                  })),
                },
              }
            : {}),
        },
        include: this.includeRelations,
      });

      if (ingredientsLines || childrenLines) {
        await this.refreshCosts(tenantId, { componentIds: [component.id] });
        return this.findOne(component.id, tenantId);
      }

      this.logger.log(`Menu component created: ${component.id}`);
      return component;
    } catch (error) {
      this.logger.error(`Failed to create menu component: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(field ? `Invalid reference: ${field}` : `Invalid ingredient or child component ID in the provided data`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A component with this name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching menu components for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [components, total] = await Promise.all([
        this.prisma.menuComponent.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: 'asc' },
          include: this.includeRelations,
          skip,
          take: limit,
        }),
        this.prisma.menuComponent.count({ where: { tenantId, deletedAt: null } }),
      ]);
      this.logger.log(`Found ${components.length}/${total} menu components`);
      return {
        data: components,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch menu components: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching menu component ${id} for tenant ${tenantId}`);
    const component = await this.prisma.menuComponent.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.includeRelations,
    });

    if (!component) {
      this.logger.warn(`Menu component ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Menu component with ID ${id} not found`);
    }

    return component;
  }

  async update(id: string, dto: UpdateMenuComponentDto, tenantId: string) {
    this.logger.log(`Updating menu component ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.unitCost !== undefined) updateData.unitCost = dto.unitCost;
    if (dto.allergens !== undefined) updateData.allergens = dto.allergens;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.storageType !== undefined) updateData.storageType = dto.storageType as any;
    if (dto.subComponents !== undefined) updateData.subComponents = dto.subComponents;
    if (dto.componentCategory !== undefined) updateData.componentCategory = dto.componentCategory;
    if (dto.numberOfUnitsRecipe !== undefined) updateData.numberOfUnitsRecipe = dto.numberOfUnitsRecipe;

    const ingredientsLines = Array.isArray((dto as any).ingredients) ? (dto as any).ingredients : undefined;
    const childrenLines = Array.isArray((dto as any).children) ? (dto as any).children : undefined;

    await Promise.all([
      this.assertIngredientsExist(
        (ingredientsLines || []).map((l: any) => l?.ingredientId),
        tenantId,
      ),
      this.assertChildrenExist(
        (childrenLines || []).map((l: any) => l?.childId),
        tenantId,
      ),
    ]);

    if (ingredientsLines) {
      updateData.ingredients = {
        deleteMany: {},
        create: ingredientsLines.map((l: any) => ({
          ingredientId: l.ingredientId,
          quantity: Number(l.quantity ?? l.numberOfUnits),
          unit: l.unit,
          unitCost: this.toDecimalOrUndefined(l.unitCost),
          cost: this.toDecimalOrUndefined(l.cost),
        })),
      };
    }

    if (childrenLines) {
      updateData.children = {
        deleteMany: {},
        create: childrenLines.map((l: any) => ({
          childId: l.childId,
          quantity: Number(l.quantity),
          unit: l.unit,
          cost: this.toDecimalOrUndefined(l.cost),
        })),
      };
    }

    try {
      const component = await this.prisma.menuComponent.update({
        where: { id },
        data: updateData,
        include: this.includeRelations,
      });
      this.logger.log(`Menu component ${id} updated`);

      if (ingredientsLines || childrenLines) {
        await this.refreshCosts(tenantId, { componentIds: [id] });
        return this.findOne(id, tenantId);
      }

      return component;
    } catch (error) {
      this.logger.error(`Failed to update menu component ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        const field = (error as any)?.meta?.field_name;
        throw new BadRequestException(field ? `Invalid reference: ${field}` : `Invalid ingredient or child component ID in the provided data`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu component with ID ${id} not found`);
      }
      throw error;
    }
  }

  async refreshCosts(tenantId: string, opts?: { componentIds?: string[] }) {
    const componentIds = opts?.componentIds;
    this.logger.log(`Refreshing menu component costs for tenant ${tenantId}${componentIds?.length ? ` (ids=${componentIds.length})` : ''}...`);

    const components = await this.prisma.menuComponent.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(componentIds?.length ? { id: { in: componentIds } } : {}),
      },
      include: {
        ingredients: true,
        children: true,
      },
    });

    let updatedComponents = 0;
    let updatedLines = 0;

    for (const comp of components) {
      const ingredientLineUpdates = [] as any[];
      for (const line of comp.ingredients || []) {
        const unitCost = Number(line.unitCost || 0) || (await this.resolveIngredientUnitCost(line.ingredientId, tenantId));
        const cost = Math.round((unitCost * (Number(line.quantity) || 0)) * 10000) / 10000;
        ingredientLineUpdates.push(
          this.prisma.componentIngredient.update({
            where: { id: line.id },
            data: { unitCost, cost },
          }),
        );
      }

      const childLineUpdates = [] as any[];
      for (const line of comp.children || []) {
        const childUnitCost = await this.computeComponentUnitCost(line.childId, tenantId, [comp.id]);
        const cost = Math.round((childUnitCost * (Number(line.quantity) || 0)) * 10000) / 10000;
        childLineUpdates.push(
          this.prisma.componentComponent.update({
            where: { id: line.id },
            data: { cost },
          }),
        );
      }

      const unitCost = await this.computeComponentUnitCost(comp.id, tenantId);

      await this.prisma.$transaction([
        ...ingredientLineUpdates,
        ...childLineUpdates,
        this.prisma.menuComponent.update({ where: { id: comp.id }, data: { unitCost } }),
      ]);

      updatedComponents++;
      updatedLines += (comp.ingredients?.length || 0) + (comp.children?.length || 0);
    }

    this.logger.log(`Refreshed costs for ${updatedComponents} components (${updatedLines} lines)`);
    return { updatedComponents, updatedLines };
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting menu component ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    try {
      const result = await this.prisma.menuComponent.update({ where: { id }, data: { deletedAt: new Date() } });
      this.logger.log(`Menu component ${id} soft-deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu component ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Menu component with ID ${id} not found`);
      }
      throw error;
    }
  }

  async repair(tenantId: string) {
    this.logger.log(`Repairing menu components for tenant ${tenantId}...`);
    try {
      // Recalculate unit costs from subComponents
      const components = await this.prisma.menuComponent.findMany({
        where: { tenantId },
        include: this.includeRelations,
      });

      let repaired = 0;
      for (const comp of components) {
        const subComps = comp.subComponents as any[];
        if (subComps && Array.isArray(subComps) && subComps.length > 0) {
          const totalCost = subComps.reduce((sum, sub) => sum + (Number(sub.cost) || 0), 0);
          const unitCost = totalCost * (comp.numberOfUnitsRecipe || 1);
          await this.prisma.menuComponent.update({
            where: { id: comp.id },
            data: { unitCost },
          });
          repaired++;
        }
      }

      this.logger.log(`Repaired ${repaired} menu components`);
      return { repaired, total: components.length };
    } catch (error) {
      this.logger.error(`Failed to repair menu components: ${error.message}`, error.stack);
      throw error;
    }
  }
}
