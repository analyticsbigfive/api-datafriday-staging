import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PackagingService {
  private readonly logger = new Logger(PackagingService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, tenantId: string) {
    this.logger.log(`Creating packaging "${dto.name}" for tenant ${tenantId}`);
    try {
      return await this.prisma.packaging.create({
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
      this.logger.error(`Failed to create packaging: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid marketPriceId provided`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A packaging with this name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching packaging for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        this.prisma.packaging.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: 'asc' },
          include: { marketPrice: true },
          skip,
          take: limit,
        }),
        this.prisma.packaging.count({ where: { tenantId, deletedAt: null } }),
      ]);
      this.logger.log(`Found ${data.length}/${total} packaging items`);
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    } catch (error) {
      this.logger.error(`Failed to fetch packaging: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching packaging ${id} for tenant ${tenantId}`);
    const packaging = await this.prisma.packaging.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { marketPrice: true, menuItemPackagings: true },
    });
    if (!packaging) {
      this.logger.warn(`Packaging ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Packaging with ID ${id} not found`);
    }
    return packaging;
  }

  async update(id: string, dto: any, tenantId: string) {
    this.logger.log(`Updating packaging ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);
    try {
      const result = await this.prisma.packaging.update({
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
      this.logger.log(`Packaging ${id} updated`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to update packaging ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid marketPriceId provided`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Packaging with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting packaging ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);
    try {
      const result = await this.prisma.packaging.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      this.logger.log(`Packaging ${id} soft-deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete packaging ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Packaging with ID ${id} not found`);
      }
      throw error;
    }
  }
}
