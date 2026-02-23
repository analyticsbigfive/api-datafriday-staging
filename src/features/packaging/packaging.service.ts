import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class PackagingService {
  private readonly logger = new Logger(PackagingService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, tenantId: string) {
    this.logger.log(`Creating packaging "${dto.name}" for tenant ${tenantId}`);
    return this.prisma.packaging.create({
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
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
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
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, tenantId: string) {
    const packaging = await this.prisma.packaging.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { marketPrice: true, menuItemPackagings: true },
    });
    if (!packaging) throw new NotFoundException(`Packaging ${id} not found`);
    return packaging;
  }

  async update(id: string, dto: any, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.packaging.update({
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
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.packaging.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
