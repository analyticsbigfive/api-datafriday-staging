import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../core/database/prisma.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides = {}) {
  return {
    id: 'snap-1',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-1',
    inventoryCounts: { 'shop-1': { 'item-1': { packedUnits: 2, looseUnits: 3 } } },
    createdBy: 'user-1',
    createdAt: new Date('2026-06-18T10:00:00Z'),
    updatedAt: new Date('2026-06-18T10:00:00Z'),
    ...overrides,
  };
}

function makeCount(overrides = {}) {
  return {
    id: 'cnt-1',
    tenantId: 'tenant-1',
    spaceId: 'space-1',
    eventId: 'event-1',
    shopId: 'shop-1',
    itemId: 'item-1',
    packedUnits: 4,
    looseUnits: 1,
    isCounted: true,
    storageLocation: 'Zone A',
    countingStatus: 'counted',
    discardedQuantity: 0,
    discardedReason: null,
    countedBy: 'user-1',
    createdAt: new Date('2026-06-18T12:00:00Z'),
    updatedAt: new Date('2026-06-18T12:00:00Z'),
    ...overrides,
  };
}

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  inventorySnapshot: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  inventoryCount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getBySpaceAndEvent ──────────────────────────────────────────────────────

  describe('getBySpaceAndEvent', () => {
    it('prioritise InventoryCount rows over snapshot when both exist', async () => {
      const snap = makeSnapshot();
      const count = makeCount();
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([count]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      // Le résultat doit être construit depuis les counts, pas le blob snapshot
      expect(result.inventoryCounts).toEqual({
        'shop-1': {
          'item-1': {
            itemId: 'item-1',
            packedUnits: 4,
            looseUnits: 1,
            isCounted: true,
            storageLocation: 'Zone A',
            countingStatus: 'counted',
          },
        },
      });
      expect(result.spaceId).toBe('space-1');
      expect(result.eventId).toBe('event-1');
    });

    it('falls back to snapshot when no InventoryCount rows exist', async () => {
      const snap = makeSnapshot();
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(result).toEqual(snap);
    });

    it('returns empty state (not 404) when neither snapshot nor counts exist', async () => {
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(result.id).toBeNull();
      expect(result.inventoryCounts).toEqual({});
      expect(result.spaceId).toBe('space-1');
      expect(result.eventId).toBe('event-1');
    });

    it('skips counts with null shopId in buildInventoryCounts', async () => {
      const countNoShop = makeCount({ shopId: null });
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([countNoShop]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      // counts sans shopId ne peuvent pas être adressés par le front — on les ignore
      expect(result.inventoryCounts).toEqual({});
    });

    it('groups multiple counts by shopId correctly', async () => {
      const c1 = makeCount({ id: 'c1', shopId: 'shop-A', itemId: 'item-1', packedUnits: 2, looseUnits: 0 });
      const c2 = makeCount({ id: 'c2', shopId: 'shop-A', itemId: 'item-2', packedUnits: 0, looseUnits: 5 });
      const c3 = makeCount({ id: 'c3', shopId: 'shop-B', itemId: 'item-1', packedUnits: 1, looseUnits: 1 });
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.findMany.mockResolvedValue([c1, c2, c3]);

      const result = await service.getBySpaceAndEvent('space-1', 'event-1', 'tenant-1');

      expect(Object.keys(result.inventoryCounts)).toHaveLength(2);
      expect(result.inventoryCounts['shop-A']['item-1'].packedUnits).toBe(2);
      expect(result.inventoryCounts['shop-A']['item-2'].looseUnits).toBe(5);
      expect(result.inventoryCounts['shop-B']['item-1'].packedUnits).toBe(1);
    });
  });

  // ── getLatestBySpace ────────────────────────────────────────────────────────

  describe('getLatestBySpace', () => {
    it('returns null when no data exists', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');
      expect(result).toBeNull();
    });

    it('returns snapshot when no counts exist', async () => {
      const snap = makeSnapshot();
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');
      expect(result).toEqual(snap);
    });

    it('returns counts-based response when count is newer than snapshot', async () => {
      const snap = makeSnapshot({ createdAt: new Date('2026-06-18T10:00:00Z') });
      const latestCount = makeCount({ updatedAt: new Date('2026-06-18T12:00:00Z') });
      const allCounts = [latestCount];

      mockPrisma.inventoryCount.findFirst.mockResolvedValue(latestCount);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);
      mockPrisma.inventoryCount.findMany.mockResolvedValue(allCounts);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');

      expect(result.eventId).toBe(latestCount.eventId);
      expect(result.inventoryCounts['shop-1']).toBeDefined();
    });

    it('returns snapshot when snapshot is newer than counts', async () => {
      const snap = makeSnapshot({ createdAt: new Date('2026-06-18T14:00:00Z') });
      const latestCount = makeCount({ updatedAt: new Date('2026-06-18T10:00:00Z') });

      mockPrisma.inventoryCount.findFirst.mockResolvedValue(latestCount);
      mockPrisma.inventorySnapshot.findFirst.mockResolvedValue(snap);

      const result = await service.getLatestBySpace('space-1', 'tenant-1');
      expect(result).toEqual(snap);
    });
  });

  // ── upsertInventory ─────────────────────────────────────────────────────────

  describe('upsertInventory', () => {
    it('creates a new InventorySnapshot (append-only)', async () => {
      const snap = makeSnapshot();
      mockPrisma.inventorySnapshot.create.mockResolvedValue(snap);

      const dto = {
        spaceId: 'space-1',
        eventId: 'event-1',
        inventoryCounts: { 'shop-1': { 'item-1': { packedUnits: 2, looseUnits: 0 } } },
      };
      const result = await service.upsertInventory(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventorySnapshot.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          spaceId: 'space-1',
          eventId: 'event-1',
          inventoryCounts: dto.inventoryCounts,
          createdBy: 'user-1',
        },
      });
      expect(result).toEqual(snap);
    });

    it('handles null eventId gracefully', async () => {
      const snap = makeSnapshot({ eventId: null });
      mockPrisma.inventorySnapshot.create.mockResolvedValue(snap);

      await service.upsertInventory({ spaceId: 'space-1', inventoryCounts: {} }, 'tenant-1');

      expect(mockPrisma.inventorySnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eventId: null }) }),
      );
    });
  });

  // ── saveInventoryCounts ─────────────────────────────────────────────────────

  describe('saveInventoryCounts', () => {
    const dto = {
      spaceId: 'space-1',
      eventId: 'event-1',
      shopId: 'shop-1',
      itemId: 'item-1',
      packedUnits: 3,
      looseUnits: 1,
      isCounted: false,
      storageLocation: null,
      countingStatus: 'pending',
    };

    it('creates a new row when no existing count found', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      const created = makeCount({ packedUnits: 3, looseUnits: 1 });
      mockPrisma.inventoryCount.create.mockResolvedValue(created);

      const result = await service.saveInventoryCounts(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventoryCount.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          spaceId: 'space-1',
          eventId: 'event-1',
          shopId: 'shop-1',
          itemId: 'item-1',
          packedUnits: 3,
          looseUnits: 1,
          isCounted: false,
          countingStatus: 'pending',
          countedBy: 'user-1',
        }),
      });
      expect(mockPrisma.inventoryCount.update).not.toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('updates existing row when count already exists', async () => {
      const existing = makeCount({ id: 'cnt-existing' });
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(existing);
      const updated = { ...existing, packedUnits: 3, looseUnits: 1, isCounted: false };
      mockPrisma.inventoryCount.update.mockResolvedValue(updated);

      const result = await service.saveInventoryCounts(dto, 'tenant-1', 'user-1');

      expect(mockPrisma.inventoryCount.update).toHaveBeenCalledWith({
        where: { id: 'cnt-existing' },
        data: expect.objectContaining({ packedUnits: 3, looseUnits: 1, isCounted: false }),
      });
      expect(mockPrisma.inventoryCount.create).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('handles null eventId and shopId in findFirst lookup', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.create.mockResolvedValue(makeCount());

      await service.saveInventoryCounts(
        { spaceId: 'space-1', itemId: 'item-1', packedUnits: 0, looseUnits: 0, isCounted: false },
        'tenant-1',
      );

      expect(mockPrisma.inventoryCount.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ eventId: null, shopId: null }),
      });
    });

    it('defaults countingStatus to "pending" when not provided', async () => {
      mockPrisma.inventoryCount.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryCount.create.mockResolvedValue(makeCount());

      await service.saveInventoryCounts(
        { spaceId: 'space-1', itemId: 'item-1', packedUnits: 0, looseUnits: 0, isCounted: false },
        'tenant-1',
      );

      expect(mockPrisma.inventoryCount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ countingStatus: 'pending' }),
        }),
      );
    });
  });
});
