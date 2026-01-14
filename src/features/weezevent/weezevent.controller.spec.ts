import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventController } from './weezevent.controller';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncTrackerService } from './services/sync-tracker.service';

describe('WeezeventController', () => {
  let controller: WeezeventController;
  let syncService: WeezeventSyncService;
  let prisma: PrismaService;
  let syncTracker: SyncTrackerService;

  const mockUser = {
    id: 'user-123',
    tenantId: 'tenant-123',
    email: 'test@example.com',
    role: 'ADMIN',
  };

  const mockTransaction = {
    id: 'tx-123',
    tenantId: 'tenant-123',
    transactionDate: new Date('2024-01-15'),
    status: 'completed',
    total: 100,
    items: [],
  };

  const mockEvent = {
    id: 'event-123',
    tenantId: 'tenant-123',
    externalId: 'weez-event-123',
    name: 'Test Event',
    startDate: new Date('2024-02-01'),
    endDate: new Date('2024-02-03'),
    syncedAt: new Date(),
  };

  const mockProduct = {
    id: 'product-123',
    tenantId: 'tenant-123',
    externalId: 'weez-prod-123',
    name: 'Test Product',
    category: 'food',
    price: 10.00,
    syncedAt: new Date(),
  };

  const mockPrismaService = {
    weezeventTransaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    weezeventEvent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    weezeventProduct: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockSyncService = {
    syncTransactions: jest.fn(),
    syncEvents: jest.fn(),
    syncProducts: jest.fn(),
  };

  const mockSyncTracker = {
    getRunningSyncs: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WeezeventController],
      providers: [
        {
          provide: WeezeventSyncService,
          useValue: mockSyncService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SyncTrackerService,
          useValue: mockSyncTracker,
        },
      ],
    }).compile();

    controller = module.get<WeezeventController>(WeezeventController);
    syncService = module.get<WeezeventSyncService>(WeezeventSyncService);
    prisma = module.get<PrismaService>(PrismaService);
    syncTracker = module.get<SyncTrackerService>(SyncTrackerService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([mockTransaction]);
      mockPrismaService.weezeventTransaction.count.mockResolvedValue(1);

      const result = await controller.getTransactions(mockUser, {});

      expect(result).toEqual({
        data: [mockTransaction],
        meta: {
          current_page: 1,
          per_page: 50,
          total: 1,
          total_pages: 1,
        },
      });
    });

    it('should apply filters', async () => {
      mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([]);
      mockPrismaService.weezeventTransaction.count.mockResolvedValue(0);

      await controller.getTransactions(mockUser, {
        status: 'C',
        eventId: 'event-123',
        page: 2,
        perPage: 10,
      });

      expect(mockPrismaService.weezeventTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            status: 'C',
            eventId: 'event-123',
          }),
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('getTransaction', () => {
    it('should return a single transaction', async () => {
      mockPrismaService.weezeventTransaction.findFirst.mockResolvedValue(mockTransaction);

      const result = await controller.getTransaction(mockUser, 'tx-123');

      expect(result).toEqual(mockTransaction);
      expect(mockPrismaService.weezeventTransaction.findFirst).toHaveBeenCalledWith({
        where: { id: 'tx-123', tenantId: 'tenant-123' },
        include: expect.any(Object),
      });
    });
  });

  describe('syncData', () => {
    it('should trigger transactions sync', async () => {
      const syncResult = { success: true, synced: 100, errors: [] };
      mockSyncService.syncTransactions.mockResolvedValue(syncResult);

      const result = await controller.syncData(mockUser, { type: 'transactions' });

      expect(result).toEqual(syncResult);
      expect(mockSyncService.syncTransactions).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          fromDate: undefined,
          toDate: undefined,
          full: undefined,
          eventId: undefined,
        }),
      );
    });

    it('should trigger events sync', async () => {
      const syncResult = { success: true, synced: 10, errors: [] };
      mockSyncService.syncEvents.mockResolvedValue(syncResult);

      const result = await controller.syncData(mockUser, { type: 'events' });

      expect(result).toEqual(syncResult);
      expect(mockSyncService.syncEvents).toHaveBeenCalledWith('tenant-123');
    });

    it('should trigger products sync', async () => {
      const syncResult = { success: true, synced: 50, errors: [] };
      mockSyncService.syncProducts.mockResolvedValue(syncResult);

      const result = await controller.syncData(mockUser, { type: 'products' });

      expect(result).toEqual(syncResult);
      expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-123');
    });

    it('should throw for unknown sync type', async () => {
      await expect(
        controller.syncData(mockUser, { type: 'unknown' as any }),
      ).rejects.toThrow('Sync type unknown not yet implemented');
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', async () => {
      mockPrismaService.weezeventTransaction.findFirst.mockResolvedValue({
        syncedAt: new Date('2024-01-01'),
      });
      mockPrismaService.weezeventEvent.findFirst.mockResolvedValue({
        syncedAt: new Date('2024-01-01'),
      });
      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue({
        syncedAt: new Date('2024-01-01'),
      });
      mockPrismaService.weezeventTransaction.count.mockResolvedValue(100);
      mockPrismaService.weezeventEvent.count.mockResolvedValue(10);
      mockPrismaService.weezeventProduct.count.mockResolvedValue(50);
      mockSyncTracker.getRunningSyncs.mockReturnValue([]);

      const result = await controller.getSyncStatus(mockUser);

      expect(result).toEqual({
        lastSync: {
          transactions: new Date('2024-01-01'),
          events: new Date('2024-01-01'),
          products: new Date('2024-01-01'),
        },
        counts: {
          transactions: 100,
          events: 10,
          products: 50,
        },
        runningSyncs: [],
        isRunning: false,
      });
    });
  });

  describe('getEvents', () => {
    it('should return paginated events', async () => {
      mockPrismaService.weezeventEvent.findMany.mockResolvedValue([mockEvent]);
      mockPrismaService.weezeventEvent.count.mockResolvedValue(1);

      const result = await controller.getEvents(mockUser, 1, 50);

      expect(result).toEqual({
        data: [mockEvent],
        meta: {
          current_page: 1,
          per_page: 50,
          total: 1,
          total_pages: 1,
        },
      });
    });
  });

  describe('getProducts', () => {
    it('should return paginated products', async () => {
      mockPrismaService.weezeventProduct.findMany.mockResolvedValue([mockProduct]);
      mockPrismaService.weezeventProduct.count.mockResolvedValue(1);

      const result = await controller.getProducts(mockUser, 1, 50);

      expect(result).toEqual({
        data: [mockProduct],
        meta: {
          current_page: 1,
          per_page: 50,
          total: 1,
          total_pages: 1,
        },
      });
    });

    it('should filter by category', async () => {
      mockPrismaService.weezeventProduct.findMany.mockResolvedValue([]);
      mockPrismaService.weezeventProduct.count.mockResolvedValue(0);

      await controller.getProducts(mockUser, 1, 50, 'food');

      expect(mockPrismaService.weezeventProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-123',
            category: 'food',
          },
        }),
      );
    });
  });
});
