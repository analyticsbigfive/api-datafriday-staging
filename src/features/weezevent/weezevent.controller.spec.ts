import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventController } from './weezevent.controller';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { WeezeventIncrementalSyncService } from './services/weezevent-incremental-sync.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SyncTrackerService } from './services/sync-tracker.service';
import { QueueService } from '../../core/queue/queue.service';

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
      update: jest.fn(),
    },
    weezeventProductMapping: {
      findMany: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    weezeventOrder: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    weezeventPrice: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    weezeventAttendee: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    menuItem: {
      findFirst: jest.fn(),
    },
    weezeventIntegration: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation((ops: any[]) =>
      Promise.all(Array.isArray(ops) ? ops : [ops]),
    ),
  };

  const mockWeezeventClientService = {
    getProduct: jest.fn(),
  };

  const mockSyncService = {
    syncTransactions: jest.fn(),
    syncEvents: jest.fn(),
    syncProducts: jest.fn(),
    syncOrders: jest.fn(),
    syncPrices: jest.fn(),
    syncAttendees: jest.fn(),
  };

  const mockIncrementalSyncService = {
    syncTransactionsIncremental: jest.fn(),
    syncEventsIncremental: jest.fn(),
    getSyncStatus: jest.fn().mockResolvedValue({}),
    resetSyncState: jest.fn().mockResolvedValue(undefined),
  };

  const mockSyncTracker = {
    getRunningSyncs: jest.fn().mockReturnValue([]),
  };

  const mockQueueService = {
    addDataSyncJob: jest.fn(),
    queueWeezeventSyncType: jest.fn().mockResolvedValue({ id: 'job-123' }),
    getQueueStats: jest.fn().mockResolvedValue({}),
    getActiveJobsProgress: jest.fn().mockResolvedValue({}),
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
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
        {
          provide: WeezeventClientService,
          useValue: mockWeezeventClientService,
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

      const result = await controller.getTransactions(mockUser, { integrationId: 'integration-123' } as any);

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
        integrationId: 'integration-123',
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
      mockPrismaService.weezeventTransaction.count.mockResolvedValue(500);

      const result = await controller.syncData(mockUser, { integrationId: 'integration-123', type: 'transactions' });

      expect(result).toMatchObject({ status: 'completed', syncType: 'transactions', itemsSynced: 100, itemsCreated: 50 });
      expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
        'tenant-123',
        'integration-123',
        expect.objectContaining({
          forceFullSync: expect.any(Boolean),
        }),
      );
    });

    it('should trigger events incremental sync', async () => {
      const syncResult = { 
        success: true, 
        isIncremental: true, 
        itemsSynced: 10, 
        itemsCreated: 10,
        errors: [] 
      };
      mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue(syncResult);
      mockPrismaService.weezeventEvent.count.mockResolvedValue(10);

      const result = await controller.syncData(mockUser, { integrationId: 'integration-123', type: 'events' });

      expect(result).toMatchObject({ status: 'completed', syncType: 'events', itemsSynced: 10 });
      expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith(
        'tenant-123',
        'integration-123',
        expect.objectContaining({
          forceFullSync: expect.any(Boolean),
        }),
      );
    });

    it('should trigger products sync', async () => {
      const syncResult = { success: true, itemsSynced: 50, itemsCreated: 50, errors: [] };
      mockSyncService.syncProducts.mockResolvedValue(syncResult);
      mockPrismaService.weezeventProduct.count.mockResolvedValue(50);

      const result = await controller.syncData(mockUser, { integrationId: 'integration-123', type: 'products' });

      expect(result).toMatchObject({ status: 'completed', syncType: 'products' });
      expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-123', 'integration-123');
    });

    it('should throw for unknown sync type', async () => {
      await expect(
        controller.syncData(mockUser, { integrationId: 'integration-123', type: 'unknown' as any }),
      ).rejects.toThrow();
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

      await controller.getProducts(mockUser, 1, 50, undefined, 'food');

      expect(mockPrismaService.weezeventProduct.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            category: 'food',
          }),
        }),
      );
    });
  });

  describe('mapProductToMenuItem', () => {
    it('should create product mapping successfully', async () => {
      const mockProduct = { id: 'prod-123', tenantId: 'tenant-123', name: 'Burger', productType: 'STANDARD', weezeventId: 'weez-123' };
      const mockMenuItem = { id: 'menu-123', tenantId: 'tenant-123', name: 'Burger Classic' };
      const mockMapping = {
        id: 'mapping-123',
        tenantId: 'tenant-123',
        weezeventProductId: 'prod-123',
        menuItemId: 'menu-123',
        autoMapped: false,
        confidence: null,
        mappedBy: 'user-123',
      };

      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(mockProduct);
      mockPrismaService.menuItem.findFirst.mockResolvedValue(mockMenuItem);
      mockPrismaService.weezeventProductMapping.upsert.mockResolvedValue(mockMapping);

      const result = await controller.mapProductToMenuItem(
        mockUser,
        'prod-123',
        { menuItemId: 'menu-123' },
      );

      expect(result.success).toBe(true);
      expect(result.mapping).toEqual(mockMapping);
      expect(mockPrismaService.weezeventProductMapping.upsert).toHaveBeenCalledWith({
        where: { weezeventProductId: 'prod-123' },
        create: expect.objectContaining({
          tenantId: 'tenant-123',
          weezeventProductId: 'prod-123',
          menuItemId: 'menu-123',
          mappedBy: 'user-123',
        }),
        update: expect.objectContaining({
          menuItemId: 'menu-123',
        }),
      });
    });

    it('should throw error if product not found', async () => {
      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(null);

      await expect(
        controller.mapProductToMenuItem(mockUser, 'invalid-prod', { menuItemId: 'menu-123' }),
      ).rejects.toThrow('Product not found');
    });

    it('should throw error if menu item not found', async () => {
      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue({ id: 'prod-123', productType: 'STANDARD', weezeventId: 'weez-123' });
      mockPrismaService.menuItem.findFirst.mockResolvedValue(null);

      await expect(
        controller.mapProductToMenuItem(mockUser, 'prod-123', { menuItemId: 'invalid-menu' }),
      ).rejects.toThrow('Menu item not found');
    });

    it('should propagate mapping to VARIANT children when parent is VARIANT_BASE', async () => {
      const mockParent = { id: 'parent-prod', tenantId: 'tenant-123', productType: 'VARIANT_BASE', weezeventId: 'weez-base-100' };
      const mockMenuItem = { id: 'menu-123', tenantId: 'tenant-123', name: 'T-Shirt' };
      const mockParentMapping = { id: 'mapping-parent', weezeventProductId: 'parent-prod', menuItemId: 'menu-123' };
      const mockVariants = [{ id: 'variant-S' }, { id: 'variant-M' }, { id: 'variant-L' }];

      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(mockParent);
      mockPrismaService.menuItem.findFirst.mockResolvedValue(mockMenuItem);
      mockPrismaService.weezeventProductMapping.upsert.mockResolvedValue(mockParentMapping);
      mockPrismaService.weezeventProduct.findMany.mockResolvedValue(mockVariants);
      mockPrismaService.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));

      const result = await controller.mapProductToMenuItem(
        mockUser,
        'parent-prod',
        { menuItemId: 'menu-123' },
      );

      expect(result.success).toBe(true);
      // findMany should be called to look up variant children
      expect(mockPrismaService.weezeventProduct.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', variantOfId: 'weez-base-100' },
        select: { id: true },
      });
      // $transaction called once with 3 upserts (one per variant)
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      // Each variant upsert should use autoMapped: true
      expect(mockPrismaService.weezeventProductMapping.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ weezeventProductId: 'variant-S', autoMapped: true, menuItemId: 'menu-123' }),
        }),
      );
    });

    it('should not call findMany when product is not VARIANT_BASE', async () => {
      const mockProduct = { id: 'prod-std', tenantId: 'tenant-123', productType: 'STANDARD', weezeventId: 'weez-std' };
      const mockMenuItem = { id: 'menu-123', tenantId: 'tenant-123' };
      const mockMapping = { id: 'mapping-1', weezeventProductId: 'prod-std', menuItemId: 'menu-123' };

      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(mockProduct);
      mockPrismaService.menuItem.findFirst.mockResolvedValue(mockMenuItem);
      mockPrismaService.weezeventProductMapping.upsert.mockResolvedValue(mockMapping);

      await controller.mapProductToMenuItem(mockUser, 'prod-std', { menuItemId: 'menu-123' });

      expect(mockPrismaService.weezeventProduct.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getProductMappings', () => {
    it('should return paginated product mappings', async () => {
      const mockMappings = [
        {
          id: 'mapping-1',
          weezeventProduct: { id: 'prod-1', name: 'Burger' },
          menuItem: { id: 'menu-1', name: 'Burger Classic' },
        },
      ];

      mockPrismaService.weezeventProductMapping.findMany.mockResolvedValue(mockMappings);
      mockPrismaService.weezeventProductMapping.count.mockResolvedValue(1);

      const result = await controller.getProductMappings(mockUser, 1, 50);

      expect(result.data).toEqual(mockMappings);
      expect(result.meta).toEqual({
        current_page: 1,
        per_page: 50,
        total: 1,
        total_pages: 1,
      });
    });
  });

  describe('unmapProduct', () => {
    it('should delete product mapping', async () => {
      mockPrismaService.weezeventProductMapping.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue({ productType: 'STANDARD', weezeventId: 'weez-123' });

      const result = await controller.unmapProduct(mockUser, 'prod-123');

      expect(result.success).toBe(true);
      expect(mockPrismaService.weezeventProductMapping.deleteMany).toHaveBeenCalledWith({
        where: {
          weezeventProductId: 'prod-123',
          tenantId: 'tenant-123',
        },
      });
    });

    it('should also unmap variant children when unmapping a VARIANT_BASE', async () => {
      const mockParent = { productType: 'VARIANT_BASE', weezeventId: 'weez-base-200' };
      const mockVariants = [{ id: 'var-1' }, { id: 'var-2' }];

      mockPrismaService.weezeventProductMapping.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(mockParent);
      mockPrismaService.weezeventProduct.findMany.mockResolvedValue(mockVariants);

      const result = await controller.unmapProduct(mockUser, 'parent-base-id');

      expect(result.success).toBe(true);
      // First deleteMany: remove the parent's own mapping
      expect(mockPrismaService.weezeventProductMapping.deleteMany).toHaveBeenNthCalledWith(1, {
        where: { weezeventProductId: 'parent-base-id', tenantId: 'tenant-123' },
      });
      // findMany: look up variant children
      expect(mockPrismaService.weezeventProduct.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', variantOfId: 'weez-base-200' },
        select: { id: true },
      });
      // Second deleteMany: remove all children's mappings
      expect(mockPrismaService.weezeventProductMapping.deleteMany).toHaveBeenNthCalledWith(2, {
        where: { weezeventProductId: { in: ['var-1', 'var-2'] }, tenantId: 'tenant-123' },
      });
    });

    it('should not look up variants when product is not VARIANT_BASE', async () => {
      mockPrismaService.weezeventProductMapping.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue({ productType: 'STANDARD', weezeventId: 'weez-std' });

      await controller.unmapProduct(mockUser, 'prod-std');

      expect(mockPrismaService.weezeventProduct.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getOrders', () => {
    it('should return paginated orders', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          tenantId: 'tenant-123',
          eventId: 'event-123',
          totalAmount: 100,
          status: 'completed',
        },
      ];

      mockPrismaService.weezeventOrder.findMany.mockResolvedValue(mockOrders);
      mockPrismaService.weezeventOrder.count.mockResolvedValue(1);

      const result = await controller.getOrders(mockUser, 1, 50);

      expect(result.data).toEqual(mockOrders);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by eventId', async () => {
      mockPrismaService.weezeventOrder.findMany.mockResolvedValue([]);
      mockPrismaService.weezeventOrder.count.mockResolvedValue(0);

      await controller.getOrders(mockUser, 1, 50, undefined, 'event-123');

      expect(mockPrismaService.weezeventOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-123',
            eventId: 'event-123',
          }),
        }),
      );
    });
  });

  describe('getPrices', () => {
    it('should return paginated prices', async () => {
      const mockPrices = [
        {
          id: 'price-1',
          tenantId: 'tenant-123',
          amount: 10,
          currency: 'EUR',
        },
      ];

      mockPrismaService.weezeventPrice.findMany.mockResolvedValue(mockPrices);
      mockPrismaService.weezeventPrice.count.mockResolvedValue(1);

      const result = await controller.getPrices(mockUser, 1, 50);

      expect(result.data).toEqual(mockPrices);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getAttendees', () => {
    it('should return paginated attendees', async () => {
      const mockAttendees = [
        {
          id: 'attendee-1',
          tenantId: 'tenant-123',
          eventId: 'event-123',
          email: 'attendee@example.com',
        },
      ];

      mockPrismaService.weezeventAttendee.findMany.mockResolvedValue(mockAttendees);
      mockPrismaService.weezeventAttendee.count.mockResolvedValue(1);

      const result = await controller.getAttendees(mockUser, 1, 50);

      expect(result.data).toEqual(mockAttendees);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('syncData - extended types', () => {
    it('should queue orders sync when type is orders', async () => {
      const result = await controller.syncData(mockUser, {
        integrationId: 'integration-123',
        type: 'orders',
        eventId: 'event-123',
      });

      expect(result).toMatchObject({ status: 'queued', syncType: 'orders' });
      expect(mockQueueService.queueWeezeventSyncType).toHaveBeenCalledWith(
        'tenant-123', 'orders', expect.objectContaining({ eventId: 'event-123' }),
      );
    });

    it('should throw error if eventId missing for orders sync', async () => {
      await expect(
        controller.syncData(mockUser, { integrationId: 'integration-123', type: 'orders' }),
      ).rejects.toThrow('eventId is required for orders sync');
    });

    it('should queue prices sync when type is prices', async () => {
      const result = await controller.syncData(mockUser, {
        integrationId: 'integration-123',
        type: 'prices',
        eventId: 'event-123',
      });

      expect(result).toMatchObject({ status: 'queued', syncType: 'prices' });
      expect(mockQueueService.queueWeezeventSyncType).toHaveBeenCalledWith(
        'tenant-123', 'prices', expect.objectContaining({ eventId: 'event-123' }),
      );
    });

    it('should queue attendees sync when type is attendees', async () => {
      const result = await controller.syncData(mockUser, {
        integrationId: 'integration-123',
        type: 'attendees',
        eventId: 'event-123',
      });

      expect(result).toMatchObject({ status: 'queued', syncType: 'attendees' });
      expect(mockQueueService.queueWeezeventSyncType).toHaveBeenCalledWith(
        'tenant-123', 'attendees', expect.objectContaining({ eventId: 'event-123' }),
      );
    });

    it('should throw error if eventId missing for attendees sync', async () => {
      await expect(
        controller.syncData(mockUser, { integrationId: 'integration-123', type: 'attendees' }),
      ).rejects.toThrow('eventId is required for attendees sync');
    });
  });

  describe('refreshProductFromApi', () => {
    it('should save variantOfId when API returns variant_of_id', async () => {
      const mockLocalProduct = { id: 'prod-variant', weezeventId: '1635', integrationId: 'integ-1' };
      const mockIntegration = { organizationId: 'org-42' };
      const mockFreshData = {
        id: 1635,
        name: '311C4ZW - L',
        type: 'VARIANT',
        nature: null,
        subnature: null,
        category_id: null,
        variant_of_id: 1632,
      };
      const mockUpdated = { id: 'prod-variant', productType: 'VARIANT', variantOfId: '1632' };

      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(mockLocalProduct);
      mockPrismaService.weezeventIntegration.findFirst.mockResolvedValue(mockIntegration);
      mockWeezeventClientService.getProduct.mockResolvedValue(mockFreshData);
      mockPrismaService.weezeventProduct.update.mockResolvedValue(mockUpdated);

      const result = await controller.refreshProductFromApi(mockUser, 'prod-variant');

      expect(mockPrismaService.weezeventProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productType: 'VARIANT',
            variantOfId: '1632',
          }),
        }),
      );
      expect(result.variantOfId).toBe('1632');
    });

    it('should set variantOfId to null when variant_of_id is absent', async () => {
      const mockLocalProduct = { id: 'prod-std', weezeventId: '1021', integrationId: 'integ-1' };
      const mockIntegration = { organizationId: 'org-42' };
      const mockFreshData = { id: 1021, name: '12 huitres', type: 'STANDARD', nature: null, subnature: null, category_id: 32 };
      const mockUpdated = { id: 'prod-std', productType: 'STANDARD', variantOfId: null };

      mockPrismaService.weezeventProduct.findFirst.mockResolvedValue(mockLocalProduct);
      mockPrismaService.weezeventIntegration.findFirst.mockResolvedValue(mockIntegration);
      mockWeezeventClientService.getProduct.mockResolvedValue(mockFreshData);
      mockPrismaService.weezeventProduct.update.mockResolvedValue(mockUpdated);

      const result = await controller.refreshProductFromApi(mockUser, 'prod-std');

      expect(mockPrismaService.weezeventProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ variantOfId: null }),
        }),
      );
      expect(result.variantOfId).toBeNull();
    });
  });
});
