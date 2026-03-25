import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class IngredientsService {
  private readonly logger = new Logger(IngredientsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, tenantId: string) {
    this.logger.log(`Creating ingredient "${dto.name}" for tenant ${tenantId}`);
    try {
      return await this.prisma.ingredient.create({
        data: {
          tenantId,
          name: dto.name,
          recipeUnit: dto.recipeUnit,
          purchaseUnit: dto.purchaseUnit,
          supplier: dto.supplier,
          storageType: dto.storageType,
          marketPriceId: dto.marketPriceId,
          costPerRecipeUnit: dto.costPerRecipeUnit,
          costPerPurchaseUnit: dto.costPerPurchaseUnit,
          ingredientCategory: dto.ingredientCategory,
          purchaseUnitsPerRecipeUnit: dto.purchaseUnitsPerRecipeUnit,
          active: dto.active ?? true,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create ingredient: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid marketPriceId provided`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`An ingredient with this name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching ingredients for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        this.prisma.ingredient.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: 'asc' },
          include: { marketPrice: true },
          skip,
          take: limit,
        }),
        this.prisma.ingredient.count({ where: { tenantId, deletedAt: null } }),
      ]);
      this.logger.log(`Found ${data.length}/${total} ingredients`);
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    } catch (error) {
      this.logger.error(`Failed to fetch ingredients: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching ingredient ${id} for tenant ${tenantId}`);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { marketPrice: true, componentIngredients: true, menuItemIngredients: true },
    });
    if (!ingredient) {
      this.logger.warn(`Ingredient ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Ingredient with ID ${id} not found`);
    }
    return ingredient;
  }

  async update(id: string, dto: any, tenantId: string) {
    this.logger.log(`Updating ingredient ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);
    try {
      const result = await this.prisma.ingredient.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.recipeUnit !== undefined && { recipeUnit: dto.recipeUnit }),
          ...(dto.purchaseUnit !== undefined && { purchaseUnit: dto.purchaseUnit }),
          ...(dto.supplier !== undefined && { supplier: dto.supplier }),
          ...(dto.storageType !== undefined && { storageType: dto.storageType }),
          ...(dto.marketPriceId !== undefined && { marketPriceId: dto.marketPriceId }),
          ...(dto.costPerRecipeUnit !== undefined && { costPerRecipeUnit: dto.costPerRecipeUnit }),
          ...(dto.costPerPurchaseUnit !== undefined && { costPerPurchaseUnit: dto.costPerPurchaseUnit }),
          ...(dto.ingredientCategory !== undefined && { ingredientCategory: dto.ingredientCategory }),
          ...(dto.purchaseUnitsPerRecipeUnit !== undefined && { purchaseUnitsPerRecipeUnit: dto.purchaseUnitsPerRecipeUnit }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
        include: { marketPrice: true },
      });
      this.logger.log(`Ingredient ${id} updated`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to update ingredient ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid marketPriceId provided`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Ingredient with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting ingredient ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);
    try {
      const result = await this.prisma.ingredient.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      this.logger.log(`Ingredient ${id} soft-deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete ingredient ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Ingredient with ID ${id} not found`);
      }
      throw error;
    }
  }
}
