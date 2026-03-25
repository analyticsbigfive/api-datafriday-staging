import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMarketPriceDto } from './dto/create-market-price.dto';
import { UpdateMarketPriceDto } from './dto/update-market-price.dto';

@Injectable()
export class MarketPricesService {
  private readonly logger = new Logger(MarketPricesService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMarketPriceDto, tenantId: string) {
    this.logger.log(`Creating market price "${dto.itemName}" for tenant ${tenantId}`);
    try {
      const price = await this.prisma.marketPrice.create({
        data: {
          tenantId,
          itemName: dto.itemName,
          unit: dto.unit,
          price: dto.price,
          goodType: dto.goodType,
          category: dto.category,
          image: dto.image,
          supplier: dto.supplier,
          supplierId: dto.supplierId,
          supplierItem: dto.supplierItem,
          recipeUnit: dto.recipeUnit,
          purchaseUnitConversion: dto.purchaseUnitConversion,
          pricePerUnit: dto.pricePerUnit,
          packedUnits: dto.packedUnits,
          numberOfUnits: dto.numberOfUnits,
          unitsPerPurchase: dto.unitsPerPurchase,
          packingWidth: dto.packingWidth,
          packingHeight: dto.packingHeight,
          packingLength: dto.packingLength,
        },
        include: { supplierRel: true },
      });
      this.logger.log(`Market price created: ${price.id}`);
      return price;
    } catch (error) {
      this.logger.error(`Failed to create market price: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid supplierId provided`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A market price with this item name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 200) {
    this.logger.log(`Fetching market prices for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [prices, total] = await Promise.all([
        this.prisma.marketPrice.findMany({
          where: { tenantId },
          orderBy: { itemName: 'asc' },
          include: { supplierRel: true },
          skip,
          take: limit,
        }),
        this.prisma.marketPrice.count({ where: { tenantId } }),
      ]);
      this.logger.log(`Found ${prices.length}/${total} market prices`);
      return {
        data: prices,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch market prices: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching market price ${id} for tenant ${tenantId}`);
    const price = await this.prisma.marketPrice.findFirst({
      where: { id, tenantId },
      include: { supplierRel: true },
    });

    if (!price) {
      this.logger.warn(`Market price ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Market price with ID ${id} not found`);
    }

    return price;
  }

  async update(id: string, dto: UpdateMarketPriceDto, tenantId: string) {
    this.logger.log(`Updating market price ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.itemName !== undefined) updateData.itemName = dto.itemName;
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.goodType !== undefined) updateData.goodType = dto.goodType;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.image !== undefined) updateData.image = dto.image;
    if (dto.supplier !== undefined) updateData.supplier = dto.supplier;
    if (dto.supplierId !== undefined) updateData.supplierId = dto.supplierId;
    if (dto.supplierItem !== undefined) updateData.supplierItem = dto.supplierItem;
    if (dto.recipeUnit !== undefined) updateData.recipeUnit = dto.recipeUnit;
    if (dto.purchaseUnitConversion !== undefined) updateData.purchaseUnitConversion = dto.purchaseUnitConversion;
    if (dto.pricePerUnit !== undefined) updateData.pricePerUnit = dto.pricePerUnit;
    if (dto.packedUnits !== undefined) updateData.packedUnits = dto.packedUnits;
    if (dto.numberOfUnits !== undefined) updateData.numberOfUnits = dto.numberOfUnits;
    if (dto.unitsPerPurchase !== undefined) updateData.unitsPerPurchase = dto.unitsPerPurchase;
    if (dto.packingWidth !== undefined) updateData.packingWidth = dto.packingWidth;
    if (dto.packingHeight !== undefined) updateData.packingHeight = dto.packingHeight;
    if (dto.packingLength !== undefined) updateData.packingLength = dto.packingLength;

    try {
      const price = await this.prisma.marketPrice.update({
        where: { id },
        data: updateData,
        include: { supplierRel: true },
      });
      this.logger.log(`Market price ${id} updated`);
      return price;
    } catch (error) {
      this.logger.error(`Failed to update market price ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid supplierId provided`);
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(`Market price with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting market price ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    try {
      const result = await this.prisma.marketPrice.delete({ where: { id } });
      this.logger.log(`Market price ${id} deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete market price ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Market price with ID ${id} not found`);
      }
      throw error;
    }
  }

  async removeByItemName(itemName: string, tenantId: string) {
    this.logger.log(`Deleting all market prices with itemName "${itemName}" for tenant ${tenantId}`);
    try {
      const result = await this.prisma.marketPrice.deleteMany({
        where: { itemName, tenantId },
      });
      this.logger.log(`Deleted ${result.count} market prices for itemName "${itemName}"`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete by itemName: ${error.message}`, error.stack);
      throw error;
    }
  }

  async bulkCreate(items: CreateMarketPriceDto[], tenantId: string) {
    this.logger.log(`Bulk creating ${items.length} market prices for tenant ${tenantId}`);
    try {
      const results = [];
      for (const dto of items) {
        const price = await this.prisma.marketPrice.create({
          data: {
            tenantId,
            itemName: dto.itemName,
            unit: dto.unit,
            price: dto.price,
            goodType: dto.goodType,
            category: dto.category,
            image: dto.image,
            supplier: dto.supplier,
            supplierId: dto.supplierId,
            supplierItem: dto.supplierItem,
            recipeUnit: dto.recipeUnit,
            purchaseUnitConversion: dto.purchaseUnitConversion,
            pricePerUnit: dto.pricePerUnit,
            packedUnits: dto.packedUnits,
            numberOfUnits: dto.numberOfUnits,
            unitsPerPurchase: dto.unitsPerPurchase,
            packingWidth: dto.packingWidth,
            packingHeight: dto.packingHeight,
            packingLength: dto.packingLength,
          },
        });
        results.push(price);
      }
      this.logger.log(`Bulk created ${results.length} market prices`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to bulk create: ${error.message}`, error.stack);
      throw error;
    }
  }

  async deduplicate(tenantId: string) {
    this.logger.log(`Deduplicating market prices for tenant ${tenantId}`);
    try {
      const allPrices = await this.prisma.marketPrice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      const seen = new Map<string, string>();
      const toDelete: string[] = [];

      for (const price of allPrices) {
        const key = `${price.itemName}::${price.supplierId || price.supplier || ''}`;
        if (seen.has(key)) {
          toDelete.push(price.id);
        } else {
          seen.set(key, price.id);
        }
      }

      if (toDelete.length > 0) {
        await this.prisma.marketPrice.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      this.logger.log(`Deduplicated: removed ${toDelete.length} duplicates`);
      return { removed: toDelete.length, remaining: allPrices.length - toDelete.length };
    } catch (error) {
      this.logger.error(`Failed to deduplicate: ${error.message}`, error.stack);
      throw error;
    }
  }
}
