import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * CRUD for the Market Price taxonomy (MarketPriceType / MarketPriceCategory).
 * Mirrors the Menu Item taxonomy (ProductType / ProductCategory) but is a
 * fully separate set of tables so the two lists never share values.
 */
@Injectable()
export class MarketPriceTaxonomyService {
  private readonly logger = new Logger(MarketPriceTaxonomyService.name);

  constructor(private prisma: PrismaService) {}

  // ---------------- Types ----------------

  async getTypes(tenantId: string) {
    return this.prisma.marketPriceType.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }] },
      orderBy: { name: 'asc' },
      include: {
        categories: {
          where: { OR: [{ tenantId }, { tenantId: null }] },
        },
      },
    });
  }

  async createType(name: string, tenantId?: string) {
    return this.prisma.marketPriceType.create({
      data: { name, tenantId },
      include: { categories: true },
    });
  }

  async updateType(id: string, name: string, tenantId: string) {
    const type = await this.prisma.marketPriceType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new NotFoundException(`Market price type with ID ${id} not found`);
    }
    if (type.tenantId === null) {
      throw new BadRequestException(`Cannot update global market price type`);
    }
    const updated = await this.prisma.marketPriceType.update({
      where: { id },
      data: { name },
      include: { categories: true },
    });
    this.logger.log(`Market price type ${id} updated`);
    return updated;
  }

  async deleteType(id: string, tenantId: string) {
    const type = await this.prisma.marketPriceType.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new NotFoundException(`Market price type with ID ${id} not found`);
    }
    if (type.tenantId === null) {
      throw new BadRequestException(`Cannot delete global market price type`);
    }
    await this.prisma.marketPriceType.delete({ where: { id } });
    this.logger.log(`Market price type ${id} deleted`);
  }

  // ---------------- Categories ----------------

  async getCategories(tenantId: string, typeId?: string) {
    return this.prisma.marketPriceCategory.findMany({
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

  async createCategory(name: string, typeId: string | undefined, tenantId?: string) {
    if (!typeId) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: {
              isNotEmpty: 'typeId should not be empty',
              isString: 'typeId must be a string',
            },
            messages: ['typeId should not be empty', 'typeId must be a string'],
            value: typeId,
          },
        ],
      });
    }

    const type = await this.prisma.marketPriceType.findFirst({
      where: { id: typeId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!type) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: [
          {
            property: 'typeId',
            constraints: { exists: 'typeId must reference an accessible market price type' },
            messages: ['typeId must reference an accessible market price type'],
            value: typeId,
          },
        ],
      });
    }

    return this.prisma.marketPriceCategory.create({
      data: { name, tenantId, type: { connect: { id: typeId } } },
      include: { type: true },
    });
  }

  async updateCategory(
    id: string,
    data: { name?: string; typeId?: string },
    tenantId: string,
  ) {
    const category = await this.prisma.marketPriceCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!category) {
      throw new NotFoundException(`Market price category with ID ${id} not found`);
    }
    if (category.tenantId === null) {
      throw new BadRequestException(`Cannot update global market price category`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;

    if (data.typeId !== undefined) {
      const type = await this.prisma.marketPriceType.findFirst({
        where: { id: data.typeId, OR: [{ tenantId }, { tenantId: null }] },
      });
      if (!type) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [
            {
              property: 'typeId',
              constraints: { exists: 'typeId must reference an accessible market price type' },
              messages: ['typeId must reference an accessible market price type'],
              value: data.typeId,
            },
          ],
        });
      }
      updateData.type = { connect: { id: data.typeId } };
    }

    const updated = await this.prisma.marketPriceCategory.update({
      where: { id },
      data: updateData,
      include: { type: true },
    });
    this.logger.log(`Market price category ${id} updated`);
    return updated;
  }

  async deleteCategory(id: string, tenantId: string) {
    const category = await this.prisma.marketPriceCategory.findFirst({
      where: { id, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!category) {
      throw new NotFoundException(`Market price category with ID ${id} not found`);
    }
    if (category.tenantId === null) {
      throw new BadRequestException(`Cannot delete global market price category`);
    }
    await this.prisma.marketPriceCategory.delete({ where: { id } });
    this.logger.log(`Market price category ${id} deleted`);
  }
}
