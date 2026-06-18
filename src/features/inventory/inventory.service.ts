import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBySpaceAndEvent(spaceId: string, eventId: string, tenantId: string) {
    this.logger.log(`GET inventory spaceId=${spaceId} eventId=${eventId} tenant=${tenantId}`);
    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId, eventId },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) {
      throw new NotFoundException(`No inventory snapshot for space ${spaceId} / event ${eventId}`);
    }
    return snapshot;
  }

  async getLatestBySpace(spaceId: string, tenantId: string) {
    this.logger.log(`GET latest inventory spaceId=${spaceId} tenant=${tenantId}`);
    const snapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { tenantId, spaceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!snapshot) {
      throw new NotFoundException(`No inventory snapshot for space ${spaceId}`);
    }
    return snapshot;
  }

  async upsertInventory(dto: CreateInventoryDto, tenantId: string, userId?: string) {
    this.logger.log(`POST /inventory spaceId=${dto.spaceId} eventId=${dto.eventId ?? 'null'} tenant=${tenantId}`);
    return this.prisma.inventorySnapshot.create({
      data: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        inventoryCounts: dto.inventoryCounts as any,
        createdBy: userId ?? null,
      },
    });
  }

  async saveInventoryCounts(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    this.logger.log(
      `POST /inventory-counts spaceId=${dto.spaceId} shopId=${dto.shopId ?? 'null'} itemId=${dto.itemId} tenant=${tenantId}`,
    );

    return this.prisma.inventoryCount.upsert({
      where: {
        uniq_inventory_count: {
          tenantId,
          spaceId: dto.spaceId,
          eventId: dto.eventId ?? null,
          shopId: dto.shopId ?? null,
          itemId: dto.itemId,
        },
      },
      create: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        shopId: dto.shopId ?? null,
        itemId: dto.itemId,
        packedUnits: dto.packedUnits,
        looseUnits: dto.looseUnits,
        isCounted: dto.isCounted,
        storageLocation: dto.storageLocation ?? null,
        countingStatus: dto.countingStatus ?? 'pending',
        countedBy: userId ?? null,
      },
      update: {
        packedUnits: dto.packedUnits,
        looseUnits: dto.looseUnits,
        isCounted: dto.isCounted,
        storageLocation: dto.storageLocation ?? null,
        countingStatus: dto.countingStatus ?? 'pending',
        countedBy: userId ?? null,
      },
    });
  }

  // ─── Canonical routes (P2) ───────────────────────────────────────────────────

  async getCountsBySpace(spaceId: string, tenantId: string, eventId?: string) {
    return this.prisma.inventoryCount.findMany({
      where: {
        tenantId,
        spaceId,
        ...(eventId ? { eventId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createCount(spaceId: string, tenantId: string, dto: CreateInventoryCountDto, userId?: string) {
    return this.prisma.inventoryCount.create({
      data: {
        tenantId,
        spaceId,
        eventId: dto.eventId ?? null,
        shopId: dto.shopId ?? null,
        itemId: dto.itemId,
        packedUnits: dto.packedUnits,
        looseUnits: dto.looseUnits,
        isCounted: dto.isCounted,
        storageLocation: dto.storageLocation ?? null,
        countingStatus: dto.countingStatus ?? 'pending',
        countedBy: userId ?? null,
      },
    });
  }

  async patchCount(
    countId: string,
    tenantId: string,
    patch: Partial<Pick<CreateInventoryCountDto, 'packedUnits' | 'looseUnits' | 'isCounted' | 'storageLocation' | 'countingStatus'>>,
  ) {
    const existing = await this.prisma.inventoryCount.findFirst({ where: { id: countId, tenantId } });
    if (!existing) throw new NotFoundException(`InventoryCount ${countId} not found`);
    return this.prisma.inventoryCount.update({ where: { id: countId }, data: patch });
  }

  async deleteCount(countId: string, tenantId: string) {
    const existing = await this.prisma.inventoryCount.findFirst({ where: { id: countId, tenantId } });
    if (!existing) throw new NotFoundException(`InventoryCount ${countId} not found`);
    await this.prisma.inventoryCount.delete({ where: { id: countId } });
  }

  async getSummary(spaceId: string, tenantId: string, eventId?: string) {
    const counts = await this.prisma.inventoryCount.findMany({
      where: { tenantId, spaceId, ...(eventId ? { eventId } : {}) },
    });

    const totalItems = counts.length;
    const countedItems = counts.filter((c) => c.isCounted).length;
    const pendingItems = counts.filter((c) => c.countingStatus === 'pending').length;
    const discardedItems = counts.filter((c) => c.discardedQuantity > 0).length;

    const byShopMap = new Map<string, { totalItems: number; countedItems: number }>();
    for (const c of counts) {
      const key = c.shopId ?? '__no_shop__';
      const entry = byShopMap.get(key) ?? { totalItems: 0, countedItems: 0 };
      entry.totalItems++;
      if (c.isCounted) entry.countedItems++;
      byShopMap.set(key, entry);
    }

    const byStorageMap = new Map<string, { totalItems: number; countedItems: number }>();
    for (const c of counts) {
      const key = c.storageLocation ?? '__null__';
      const entry = byStorageMap.get(key) ?? { totalItems: 0, countedItems: 0 };
      entry.totalItems++;
      if (c.isCounted) entry.countedItems++;
      byStorageMap.set(key, entry);
    }

    return {
      totalItems,
      countedItems,
      pendingItems,
      discardedItems,
      byShop: [...byShopMap.entries()].map(([shopId, v]) => ({
        shopId: shopId === '__no_shop__' ? null : shopId,
        ...v,
      })),
      byStorage: [...byStorageMap.entries()].map(([loc, v]) => ({
        storageLocation: loc === '__null__' ? null : loc,
        ...v,
      })),
    };
  }
}
