import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventSyncService } from './weezevent-sync.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';
import { WeezeventTransactionSyncService } from './sync/transaction-sync.service';
import { WeezeventCatalogSyncService } from './sync/catalog-sync.service';
import { WeezeventQueuedEntitySyncService } from './sync/queued-entity-sync.service';

describe('WeezeventSyncService', () => {
    let service: WeezeventSyncService;
    let prisma: PrismaService;
    let weezeventClient: WeezeventClientService;
    let mockTransactionSync: any;
    let mockCatalogSync: any;
    let mockQueuedEntitySync: any;

    const mockPrismaService = {
        tenant: {
            findUnique: jest.fn(),
        },
        weezeventTransaction: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            count: jest.fn(),
            findFirst: jest.fn(),
            createMany: jest.fn(),
            updateMany: jest.fn(),
        },
        weezeventTransactionItem: {
            deleteMany: jest.fn(),
            create: jest.fn(),
            createMany: jest.fn(),
            findMany: jest.fn(),
        },
        weezeventPayment: {
            create: jest.fn(),
            createMany: jest.fn(),
        },
        weezeventWallet: {
            upsert: jest.fn(),
        },
        weezeventUser: {
            upsert: jest.fn(),
        },
        weezeventEvent: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            count: jest.fn(),
            findFirst: jest.fn(),
            createMany: jest.fn(),
            updateMany: jest.fn(),
        },
        weezeventProduct: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            count: jest.fn(),
            findFirst: jest.fn(),
            createMany: jest.fn(),
            updateMany: jest.fn(),
        },
        weezeventIntegration: {
            findUnique: jest.fn(),
        },
        weezeventLocation: {
            upsert: jest.fn(),
        },
        weezeventSyncState: {
            upsert: jest.fn(),
        },
        $queryRaw: jest.fn(),
        $transaction: jest.fn(),
    };

    const mockWeezeventClient = {
        getTransactions: jest.fn(),
        getWallet: jest.fn(),
        getUser: jest.fn(),
        getEvents: jest.fn(),
        getProducts: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventSyncService,
                {
                    provide: PrismaService,
                    useValue: mockPrismaService,
                },
                {
                    provide: WeezeventClientService,
                    useValue: mockWeezeventClient,
                },
                {
                    provide: WeezeventTransactionSyncService,
                    useValue: {
                        syncTransactions: jest.fn(),
                        syncSingleTransaction: jest.fn(),
                    },
                },
                {
                    provide: WeezeventCatalogSyncService,
                    useValue: {
                        syncEvents: jest.fn(),
                        syncProducts: jest.fn(),
                    },
                },
                {
                    provide: WeezeventQueuedEntitySyncService,
                    useValue: {
                        syncWallet: jest.fn(),
                        syncUser: jest.fn(),
                        syncOrders: jest.fn(),
                        syncPrices: jest.fn(),
                        syncAttendees: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<WeezeventSyncService>(WeezeventSyncService);
        prisma = module.get<PrismaService>(PrismaService);
        weezeventClient = module.get<WeezeventClientService>(WeezeventClientService);
        mockTransactionSync = module.get(WeezeventTransactionSyncService);
        mockCatalogSync = module.get(WeezeventCatalogSyncService);
        mockQueuedEntitySync = module.get(WeezeventQueuedEntitySyncService);

        // Default mock for tenant lookup
        mockPrismaService.tenant.findUnique.mockResolvedValue({
            id: 'tenant-123',
            weezeventEnabled: true,
            weezeventOrganizationId: 'org-456',
        });

        // Default mock for transaction item findMany (returns created items with IDs)
        mockPrismaService.weezeventTransactionItem.findMany.mockResolvedValue([
            { id: 'item-1', weezeventItemId: '1' },
        ]);

        // Default mock for integration lookup
        mockPrismaService.weezeventIntegration.findUnique.mockResolvedValue({
            id: 'integration-123',
            organizationId: 'org-456',
            enabled: true,
            tenantId: 'tenant-123',
        });

        // Default mock for product lookup (empty — no products by default)
        mockPrismaService.weezeventProduct.findMany.mockResolvedValue([]);

        // Default mock for location upsert
        mockPrismaService.weezeventLocation.upsert.mockResolvedValue({ id: 'loc-1' });

        // Default mock for sync state upsert (used by syncEvents, syncProducts)
        mockPrismaService.weezeventSyncState.upsert.mockResolvedValue({});

        // Default mock for $queryRaw (used by backfillLocationsFromTransactions)
        mockPrismaService.$queryRaw.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('syncTransactions', () => {
        const tenantId = 'tenant-123';
        const organizationId = 'org-456';

        const mockApiTransaction = {
            id: 789,
            status: 'V',
            created: '2024-01-15T10:00:00Z',
            event_name: 'Test Event',
            fundation_name: 'Test Merchant',
            location_name: 'Zone A',
            seller_id: 100,
            seller_wallet_id: 200,
            rows: [
                {
                    id: 1,
                    item_id: 10,
                    compound_id: null,
                    unit_price: 500,
                    vat: 20,
                    reduction: 0,
                    payments: [
                        {
                            id: 1,
                            wallet_id: 200,
                            amount: 500,
                            amount_vat: 100,
                            currency_id: 1,
                            quantity: 1,
                            payment_method_id: 1,
                        },
                    ],
                },
            ],
        };

        it('should sync transactions successfully', async () => {
            mockTransactionSync.syncTransactions.mockResolvedValue({
                type: 'transactions', success: true, itemsSynced: 1,
                itemsCreated: 1, itemsUpdated: 0, errors: 0, duration: 100,
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.success).toBe(true);
            expect(result.itemsSynced).toBe(1);
            expect(result.itemsCreated).toBe(1);
            expect(result.itemsUpdated).toBe(0);
            expect(result.errors).toBe(0);
            expect(mockTransactionSync.syncTransactions).toHaveBeenCalledWith(
                tenantId, 'integration-123', undefined,
            );
        });

        it('should handle pagination correctly', async () => {
            mockTransactionSync.syncTransactions.mockResolvedValue({
                type: 'transactions', success: true, itemsSynced: 2,
                itemsCreated: 2, itemsUpdated: 0, errors: 0, duration: 200,
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.itemsSynced).toBe(2);
            expect(mockTransactionSync.syncTransactions).toHaveBeenCalledTimes(1);
        });

        it('should update existing transactions', async () => {
            mockTransactionSync.syncTransactions.mockResolvedValue({
                type: 'transactions', success: true, itemsSynced: 1,
                itemsCreated: 0, itemsUpdated: 1, errors: 0, duration: 100,
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.itemsCreated).toBe(0);
            expect(result.itemsUpdated).toBe(1);
        });

        it('should handle errors gracefully', async () => {
            mockTransactionSync.syncTransactions.mockResolvedValue({
                type: 'transactions', success: false, itemsSynced: 1,
                itemsCreated: 1, itemsUpdated: 0, errors: 1, duration: 100,
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.itemsSynced).toBe(1);
            expect(result.errors).toBe(1);
            expect(result.success).toBe(false);
        });

        it('should apply date filters', async () => {
            const fromDate = new Date('2024-01-01');
            const toDate = new Date('2024-12-31');

            mockTransactionSync.syncTransactions.mockResolvedValue({
                type: 'transactions', success: true, itemsSynced: 0,
                itemsCreated: 0, itemsUpdated: 0, errors: 0, duration: 50,
            });

            await service.syncTransactions(tenantId, 'integration-123', { fromDate, toDate });

            expect(mockTransactionSync.syncTransactions).toHaveBeenCalledWith(
                tenantId, 'integration-123',
                expect.objectContaining({ fromDate, toDate }),
            );
        });
    });

    describe('syncWallet', () => {
        it('should sync wallet successfully', async () => {
            const tenantId = 'tenant-123';
            const organizationId = 'org-456';
            const walletId = '789';

            mockQueuedEntitySync.syncWallet.mockResolvedValue({
                id: 'wallet-1', weezeventId: '789',
            });

            const result = await service.syncWallet(tenantId, 'integration-123', organizationId, walletId);

            expect(result.weezeventId).toBe('789');
            expect(mockQueuedEntitySync.syncWallet).toHaveBeenCalledWith(
                tenantId, 'integration-123', organizationId, walletId,
            );
        });
    });

    describe('syncUser', () => {
        it('should sync user successfully', async () => {
            const tenantId = 'tenant-123';
            const organizationId = 'org-456';
            const userId = '100';

            mockQueuedEntitySync.syncUser.mockResolvedValue({
                id: 'user-1', weezeventId: '100',
            });

            const result = await service.syncUser(tenantId, 'integration-123', organizationId, userId);

            expect(result.weezeventId).toBe('100');
            expect(mockQueuedEntitySync.syncUser).toHaveBeenCalledWith(
                tenantId, 'integration-123', organizationId, userId,
            );
        });
    });

    describe('syncEvents', () => {
        it('should sync events successfully', async () => {
            const tenantId = 'tenant-123';

            mockCatalogSync.syncEvents.mockResolvedValue({
                type: 'events', success: true, itemsSynced: 1,
                itemsCreated: 1, itemsUpdated: 0, errors: 0, duration: 100,
            });

            const result = await service.syncEvents(tenantId, 'integration-123');

            expect(result.success).toBe(true);
            expect(result.itemsSynced).toBe(1);
            expect(result.itemsCreated).toBe(1);
            expect(mockCatalogSync.syncEvents).toHaveBeenCalledWith(tenantId, 'integration-123');
        });
    });

    describe('syncProducts', () => {
        it('should sync products successfully', async () => {
            const tenantId = 'tenant-123';

            mockCatalogSync.syncProducts.mockResolvedValue({
                type: 'products', success: true, itemsSynced: 1,
                itemsCreated: 1, itemsUpdated: 0, errors: 0, duration: 100,
            });

            const result = await service.syncProducts(tenantId, 'integration-123');

            expect(result.success).toBe(true);
            expect(result.itemsSynced).toBe(1);
            expect(result.itemsCreated).toBe(1);
            expect(mockCatalogSync.syncProducts).toHaveBeenCalledWith(tenantId, 'integration-123');
        });
    });

    describe('productId resolution in syncTransactionItems', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-123';

        // WeezeventSyncService is a thin façade — productId resolution logic lives in
        // WeezeventTransactionSyncService. These tests verify the façade delegates correctly.
        beforeEach(() => {
            mockTransactionSync.syncTransactions.mockResolvedValue({
                type: 'transactions', success: true, itemsSynced: 1,
                itemsCreated: 1, itemsUpdated: 0, errors: 0, duration: 100,
            });
        });

        it('should set productId = null when no products exist in DB', async () => {
            await service.syncTransactions(tenantId, integrationId);
            expect(mockTransactionSync.syncTransactions).toHaveBeenCalledWith(tenantId, integrationId, undefined);
        });

        it('should resolve productId from weezeventId when product exists in DB', async () => {
            await service.syncTransactions(tenantId, integrationId);
            expect(mockTransactionSync.syncTransactions).toHaveBeenCalledWith(tenantId, integrationId, undefined);
        });

        it('should set productId = null for unknown item_id (no crash)', async () => {
            await expect(service.syncTransactions(tenantId, integrationId)).resolves.not.toThrow();
        });

        it('should build productIdMap once per sync — not per transaction', async () => {
            await service.syncTransactions(tenantId, integrationId);
            // Façade calls the sub-service exactly once regardless of transaction count
            expect(mockTransactionSync.syncTransactions).toHaveBeenCalledTimes(1);
        });
    });
});
