import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBySpaceAndEvent(spaceId: string, eventId: string, tenantId: string) {
    this.logger.log(`GET inventory spaceId=${spaceId} eventId=${eventId} tenant=${tenantId}`);
    const inventory = await this.prisma.inventory.findFirst({
      where: { tenantId, spaceId, eventId },
      include: { counts: { orderBy: { countedAt: 'desc' } } },
    });
    if (!inventory) {
      throw new NotFoundException(`Inventory not found for space ${spaceId} / event ${eventId}`);
    }
    return inventory;
  }

  async getLatestBySpace(spaceId: string, tenantId: string) {
    this.logger.log(`GET latest inventory spaceId=${spaceId} tenant=${tenantId}`);
    const inventory = await this.prisma.inventory.findFirst({
      where: { tenantId, spaceId },
      include: { counts: { orderBy: { countedAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!inventory) {
      throw new NotFoundException(`No inventory found for space ${spaceId}`);
    }
    return inventory;
  }

  async upsertInventory(dto: CreateInventoryDto, tenantId: string) {
    this.logger.log(`UPSERT inventory spaceId=${dto.spaceId} eventId=${dto.eventId ?? 'null'} tenant=${tenantId}`);
    return this.prisma.inventory.upsert({
      where: {
        tenantId_spaceId_eventId: {
          tenantId,
          spaceId: dto.spaceId,
          eventId: dto.eventId ?? null,
        },
      },
      create: { tenantId, spaceId: dto.spaceId, eventId: dto.eventId ?? null },
      update: { updatedAt: new Date() },
      include: { counts: true },
    });
  }

  async saveInventoryCounts(dto: CreateInventoryCountDto, tenantId: string) {
    let inventoryId = dto.inventoryId;

    if (!inventoryId) {
      if (!dto.spaceId) {
        throw new BadRequestException('inventoryId or spaceId is required');
      }
      const inventory = await this.prisma.inventory.upsert({
        where: {
          tenantId_spaceId_eventId: {
            tenantId,
            spaceId: dto.spaceId,
            eventId: dto.eventId ?? null,
          },
        },
        create: { tenantId, spaceId: dto.spaceId, eventId: dto.eventId ?? null },
        update: { updatedAt: new Date() },
      });
      inventoryId = inventory.id;
    } else {
      const exists = await this.prisma.inventory.findFirst({
        where: { id: inventoryId, tenantId },
      });
      if (!exists) {
        throw new NotFoundException(`Inventory ${inventoryId} not found`);
      }
    }

    const data = dto.counts.map((line) => ({
      inventoryId,
      packagingId: line.packagingId,
      quantity: line.quantity,
      shopId: line.shopId ?? null,
    }));

    await this.prisma.inventoryCount.createMany({ data });

    return this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { counts: { orderBy: { countedAt: 'desc' } } },
    });
  }
}
