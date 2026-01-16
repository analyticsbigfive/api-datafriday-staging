import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventController } from './weezevent.controller';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { WeezeventIncrementalSyncService } from './services/weezevent-incremental-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncTrackerService } from './services/sync-tracker.service';

describe('WeezeventController', () => {
  let controller: WeezeventController;
  let syncService: WeezeventSyncService;
  let incrementalSyncService: WeezeventIncrementalSyncService;
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

  const mockIncrementalSyncService = {
    syncTransactionsIncremental: jest.fn(),
    syncEventsIncremental: jest.fn(),
    getSyncStatus: jest.fn().mockResolvedValue({}),
    resetSyncState: jest.fn(),
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
          provide: WeezeventIncrementalSyncService,
          useValue: mockIncrementalSyncService,
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
    incrementalSyncService = module.get<WeezeventIncrementalSyncService>(WeezeventIncrementalSyncService);
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
    it('should trigger transactions incremental sync', async () => {
      const syncResult = { 
        success: true, 
        isIncremental: true, 
        itemsSynced: 100, 
        itemsCreated: 50,
        itemsSkipped: 20,
        errors: [] 
      };
      mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue(syncResult);

      const result = await controller.syncData(mockUser, { type: 'transactions' });

      expect(result).toEqual(syncResult);
      expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          forceFullSync: undefined,
          batchSize: 500,
          maxItems: 10000,
        }),
      );
    });

    it('should trigger events incremental sync', async () => {
      const syncResult = { 
        success: true, 
        isIncremental: true, 
        itemsSynced: 10, 
        errors: [] 
      };
      mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue(syncResult);

      const result = await controller.syncData(mockUser, { type: 'events' });

      expect(result).toEqual(syncResult);
      expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith(
        'tenant-123',
        expect.objectContaining({
          forceFullSync: undefined,
          batchSize: 500,
          maxItems: 10000,
        }),
      );
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
    it('should return sync status with incremental states', async () => {
      mockIncrementalSyncService.getSyncStatus.mockResolvedValue({
        events: {
          lastSyncedAt: new Date('2024-01-01'),
          totalSynced: 100,
        },
        transactions: {
          lastSyncedAt: new Date('2024-01-02'),
          totalSynced: 5000,
        },
        products: {
          totalSynced: 50,
        },
      });
      mockPrismaService.weezeventTransaction.count.mockResolvedValue(5000);
      mockPrismaService.weezeventEvent.count.mockResolvedValue(100);
      mockPrismaService.weezeventProduct.count.mockResolvedValue(50);
      mockSyncTracker.getRunningSyncs.mockReturnValue([]);

      const result = await controller.getSyncStatus(mockUser);

      expect(result).toEqual({
        events: {
          lastSyncedAt: new Date('2024-01-01'),
          totalSynced: 100,
          count: 100,
        },
        transactions: {
          lastSyncedAt: new Date('2024-01-02'),
          totalSynced: 5000,
          count: 5000,
        },
        products: {
          totalSynced: 50,
          count: 50,
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
