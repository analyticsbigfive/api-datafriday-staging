import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── GET /inventory/:spaceId/:eventId ────────────────────────────────────────
  // Priority: InventoryCount rows (granular, always up-to-date)
  //           → latest InventorySnapshot (full-blob save)
  //           → empty state (never 404 — prevents localStorage fallback on front)
  async getBySpaceAndEvent(spaceId: string, eventId: string, tenantId: string) {
    this.logger.log(`GET inventory spaceId=${spaceId} eventId=${eventId}`);

    const [snapshot, counts] = await Promise.all([
      this.prisma.inventorySnapshot.findFirst({
        where: { tenantId, spaceId, eventId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryCount.findMany({
        where: { tenantId, spaceId, eventId },
      }),
    ]);

    if (counts.length > 0) {
      return {
        id: snapshot?.id ?? null,
        tenantId,
        spaceId,
        eventId,
        inventoryCounts: this.buildInventoryCounts(counts),
        createdAt: snapshot?.createdAt ?? null,
        updatedAt: snapshot?.updatedAt ?? null,
        createdBy: snapshot?.createdBy ?? null,
      };
    }

    if (snapshot) return snapshot;

    // No data yet — return empty so the front doesn't fall back to localStorage
    return {
      id: null,
      tenantId,
      spaceId,
      eventId,
      inventoryCounts: {},
      createdAt: null,
      updatedAt: null,
      createdBy: null,
    };
  }

  // ── GET /inventory/:spaceId/latest ──────────────────────────────────────────
  // Returns the most recently touched inventory across all events for this space.
  // Front reads both `.inventoryCounts` and `.eventId` (SpaceRestockView:1099).
  // Returns null (not 404) when no inventory exists — front handles null via ?.
  async getLatestBySpace(spaceId: string, tenantId: string) {
    this.logger.log(`GET latest inventory spaceId=${spaceId}`);

    // Check which table has the freshest data
    const [latestCount, latestSnapshot] = await Promise.all([
      this.prisma.inventoryCount.findFirst({
        where: { tenantId, spaceId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.inventorySnapshot.findFirst({
        where: { tenantId, spaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const countIsNewer =
      latestCount && (!latestSnapshot || latestCount.updatedAt >= latestSnapshot.createdAt);

    if (countIsNewer) {
      // Fetch all counts for the same event as the most recent count
      const counts = await this.prisma.inventoryCount.findMany({
        where: { tenantId, spaceId, eventId: latestCount.eventId },
      });
      return {
        id: null,
        tenantId,
        spaceId,
        eventId: latestCount.eventId,
        inventoryCounts: this.buildInventoryCounts(counts),
        createdAt: latestCount.updatedAt,
        updatedAt: latestCount.updatedAt,
        createdBy: null,
      };
    }

    if (latestSnapshot) return latestSnapshot;

    return null;
  }

  // ── POST /inventory ──────────────────────────────────────────────────────────
  // Saves a full horodated snapshot (append-only).
  async upsertInventory(dto: CreateInventoryDto, tenantId: string, userId?: string) {
    this.logger.log(`POST /inventory spaceId=${dto.spaceId} eventId=${dto.eventId ?? 'null'}`);
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

  // ── POST /inventory-counts ───────────────────────────────────────────────────
  // Upsert a single item count. Uses findFirst + create/update instead of
  // prisma.upsert because Prisma 5.x does not support null values in compound
  // unique where clauses (eventId and shopId are both nullable).
  async saveInventoryCounts(dto: CreateInventoryCountDto, tenantId: string, userId?: string) {
    this.logger.log(
      `POST /inventory-counts spaceId=${dto.spaceId} shopId=${dto.shopId ?? 'null'} itemId=${dto.itemId}`,
    );

    const existing = await this.prisma.inventoryCount.findFirst({
      where: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        shopId: dto.shopId ?? null,
        itemId: dto.itemId,
      },
    });

    const data = {
      packedUnits: dto.packedUnits,
      looseUnits: dto.looseUnits,
      isCounted: dto.isCounted,
      storageLocation: dto.storageLocation ?? null,
      countingStatus: dto.countingStatus ?? 'pending',
      countedBy: userId ?? null,
    };

    if (existing) {
      return this.prisma.inventoryCount.update({ where: { id: existing.id }, data });
    }

    return this.prisma.inventoryCount.create({
      data: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: dto.eventId ?? null,
        shopId: dto.shopId ?? null,
        itemId: dto.itemId,
        ...data,
      },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private buildInventoryCounts(counts: any[]): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};
    for (const c of counts) {
      // shopId null → skip (front can't address it without a key)
      const shopKey = c.shopId;
      if (!shopKey) continue;
      if (!result[shopKey]) result[shopKey] = {};
      result[shopKey][c.itemId] = {
        itemId: c.itemId,
        packedUnits: c.packedUnits,
        looseUnits: c.looseUnits,
        isCounted: c.isCounted,
        storageLocation: c.storageLocation ?? null,
        countingStatus: c.countingStatus,
      };
    }
    return result;
  }
}
