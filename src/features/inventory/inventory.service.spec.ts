import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../core/database/prisma.service';

const mockPrisma = {
  inventory: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  inventoryCount: {
    createMany: jest.fn(),
  },
};

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBySpaceAndEvent', () => {
    it('should return inventory when found', async () => {
      const inv = { id: 'inv-1', spaceId: 's1', eventId: 'e1', counts: [] };
      mockPrisma.inventory.findFirst.mockResolvedValue(inv);
      const result = await service.getBySpaceAndEvent('s1', 'e1', 'tenant-1');
      expect(result).toEqual(inv);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.inventory.findFirst.mockResolvedValue(null);
      await expect(service.getBySpaceAndEvent('s1', 'e1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLatestBySpace', () => {
    it('should return the latest inventory', async () => {
      const inv = { id: 'inv-2', spaceId: 's1', counts: [] };
      mockPrisma.inventory.findFirst.mockResolvedValue(inv);
      const result = await service.getLatestBySpace('s1', 'tenant-1');
      expect(result).toEqual(inv);
    });

    it('should throw NotFoundException when no inventory exists', async () => {
      mockPrisma.inventory.findFirst.mockResolvedValue(null);
      await expect(service.getLatestBySpace('s1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertInventory', () => {
    it('should upsert and return inventory', async () => {
      const inv = { id: 'inv-3', spaceId: 's1', eventId: 'e1', counts: [] };
      mockPrisma.inventory.upsert.mockResolvedValue(inv);
      const result = await service.upsertInventory({ spaceId: 's1', eventId: 'e1' }, 'tenant-1');
      expect(result).toEqual(inv);
      expect(mockPrisma.inventory.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('saveInventoryCounts', () => {
    it('should create counts using provided inventoryId', async () => {
      const inv = { id: 'inv-4', spaceId: 's1', counts: [] };
      mockPrisma.inventory.findFirst.mockResolvedValue(inv);
      mockPrisma.inventoryCount.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.inventory.findUnique.mockResolvedValue({ ...inv, counts: [{ id: 'c1' }] });

      const result = await service.saveInventoryCounts(
        { inventoryId: 'inv-4', counts: [{ packagingId: 'p1', quantity: 5 }] },
        'tenant-1',
      );
      expect(mockPrisma.inventoryCount.createMany).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    it('should create inventory when spaceId given without inventoryId', async () => {
      const inv = { id: 'inv-5', spaceId: 's1', counts: [] };
      mockPrisma.inventory.upsert.mockResolvedValue(inv);
      mockPrisma.inventoryCount.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.inventory.findUnique.mockResolvedValue({ ...inv, counts: [] });

      await service.saveInventoryCounts(
        { spaceId: 's1', counts: [{ packagingId: 'p2', quantity: 3 }] },
        'tenant-1',
      );
      expect(mockPrisma.inventory.upsert).toHaveBeenCalledTimes(1);
    });

    it('should throw BadRequestException when neither inventoryId nor spaceId provided', async () => {
      await expect(
        service.saveInventoryCounts({ counts: [{ packagingId: 'p1', quantity: 1 }] }, 'tenant-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when inventoryId not found', async () => {
      mockPrisma.inventory.findFirst.mockResolvedValue(null);
      await expect(
        service.saveInventoryCounts({ inventoryId: 'missing', counts: [] }, 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
