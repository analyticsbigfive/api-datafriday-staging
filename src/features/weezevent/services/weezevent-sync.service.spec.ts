import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventSyncService } from './weezevent-sync.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';

describe('WeezeventSyncService', () => {
    let service: WeezeventSyncService;
    let prisma: PrismaService;
    let weezeventClient: WeezeventClientService;

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
            ],
        }).compile();

        service = module.get<WeezeventSyncService>(WeezeventSyncService);
        prisma = module.get<PrismaService>(PrismaService);
        weezeventClient = module.get<WeezeventClientService>(WeezeventClientService);

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
            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [mockApiTransaction],
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 1,
                    total_pages: 1,
                },
            });

            mockPrismaService.weezeventTransaction.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventTransaction.upsert.mockResolvedValue({
                id: 'trans-1',
                weezeventId: '789',
            });
            mockPrismaService.weezeventTransactionItem.deleteMany.mockResolvedValue({ count: 0 });
            mockPrismaService.weezeventTransactionItem.create.mockResolvedValue({
                id: 'item-1',
            });
            mockPrismaService.weezeventPayment.create.mockResolvedValue({
                id: 'payment-1',
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.success).toBe(true);
            expect(result.itemsSynced).toBe(1);
            expect(result.itemsCreated).toBe(1);
            expect(result.itemsUpdated).toBe(0);
            expect(result.errors).toBe(0);
            expect(mockWeezeventClient.getTransactions).toHaveBeenCalledWith(
                tenantId,
                organizationId,
                expect.objectContaining({
                    page: 1,
                    perPage: 100,
                }),
            );
        });

        it('should handle pagination correctly', async () => {
            // First page
            mockWeezeventClient.getTransactions.mockResolvedValueOnce({
                data: [mockApiTransaction],
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 150,
                    total_pages: 2,
                },
            });

            // Second page
            mockWeezeventClient.getTransactions.mockResolvedValueOnce({
                data: [{ ...mockApiTransaction, id: 790 }],
                meta: {
                    current_page: 2,
                    per_page: 100,
                    total: 150,
                    total_pages: 2,
                },
            });

            mockPrismaService.weezeventTransaction.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventTransaction.upsert.mockResolvedValue({
                id: 'trans-1',
            });
            mockPrismaService.weezeventTransactionItem.deleteMany.mockResolvedValue({ count: 0 });
            mockPrismaService.weezeventTransactionItem.create.mockResolvedValue({
                id: 'item-1',
            });
            mockPrismaService.weezeventPayment.create.mockResolvedValue({
                id: 'payment-1',
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.itemsSynced).toBe(2);
            expect(mockWeezeventClient.getTransactions).toHaveBeenCalledTimes(2);
        });

        it('should update existing transactions', async () => {
            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [mockApiTransaction],
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 1,
                    total_pages: 1,
                },
            });

            // Transaction already exists
            mockPrismaService.weezeventTransaction.findUnique.mockResolvedValue({
                id: 'existing-trans',
                weezeventId: '789',
            });

            mockPrismaService.weezeventTransaction.upsert.mockResolvedValue({
                id: 'existing-trans',
                weezeventId: '789',
            });
            mockPrismaService.weezeventTransactionItem.deleteMany.mockResolvedValue({ count: 1 });
            mockPrismaService.weezeventTransactionItem.create.mockResolvedValue({
                id: 'item-1',
            });
            mockPrismaService.weezeventPayment.create.mockResolvedValue({
                id: 'payment-1',
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.itemsCreated).toBe(0);
            expect(result.itemsUpdated).toBe(1);
        });

        it('should handle errors gracefully', async () => {
            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [mockApiTransaction, { ...mockApiTransaction, id: 790 }],
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 2,
                    total_pages: 1,
                },
            });

            mockPrismaService.weezeventTransaction.findUnique.mockResolvedValue(null);

            // First transaction succeeds
            mockPrismaService.weezeventTransaction.upsert
                .mockResolvedValueOnce({ id: 'trans-1' })
                .mockRejectedValueOnce(new Error('Database error'));

            mockPrismaService.weezeventTransactionItem.deleteMany.mockResolvedValue({ count: 0 });
            mockPrismaService.weezeventTransactionItem.create.mockResolvedValue({
                id: 'item-1',
            });
            mockPrismaService.weezeventPayment.create.mockResolvedValue({
                id: 'payment-1',
            });

            const result = await service.syncTransactions(tenantId, 'integration-123');

            expect(result.itemsSynced).toBe(1);
            expect(result.errors).toBe(1);
            expect(result.success).toBe(false);
        });

        it('should apply date filters', async () => {
            const fromDate = new Date('2024-01-01');
            const toDate = new Date('2024-12-31');

            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [],
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 0,
                    total_pages: 0,
                },
            });

            await service.syncTransactions(tenantId, 'integration-123', {
                fromDate,
                toDate,
            });

            expect(mockWeezeventClient.getTransactions).toHaveBeenCalledWith(
                tenantId,
                organizationId,
                expect.objectContaining({
                    fromDate,
                    toDate,
                }),
            );
        });
    });

    describe('syncWallet', () => {
        it('should sync wallet successfully', async () => {
            const tenantId = 'tenant-123';
            const organizationId = 'org-456';
            const walletId = '789';

            const mockWallet = {
                id: 789,
                balance: 5000,
                user_id: 100,
                wallet_group_id: 10,
                status: 'active',
                metadata: {
                    card_number: '1234',
                    card_type: 'NFC',
                },
            };

            mockWeezeventClient.getWallet.mockResolvedValue(mockWallet);
            mockPrismaService.weezeventWallet.upsert.mockResolvedValue({
                id: 'wallet-1',
                weezeventId: '789',
            });

            const result = await service.syncWallet(tenantId, 'integration-123', organizationId, walletId);

            expect(result.weezeventId).toBe('789');
            expect(mockWeezeventClient.getWallet).toHaveBeenCalledWith(
                tenantId,
                organizationId,
                walletId,
            );
        });
    });

    describe('syncUser', () => {
        it('should sync user successfully', async () => {
            const tenantId = 'tenant-123';
            const organizationId = 'org-456';
            const userId = '100';

            const mockUser = {
                id: 100,
                email: 'test@example.com',
                first_name: 'John',
                last_name: 'Doe',
                phone: '+33612345678',
                birthdate: '1990-01-01',
                address: { city: 'Paris' },
                wallet_id: 789,
                metadata: {
                    gdpr_consent: true,
                    marketing_consent: false,
                },
            };

            mockWeezeventClient.getUser.mockResolvedValue(mockUser);
            mockPrismaService.weezeventUser.upsert.mockResolvedValue({
                id: 'user-1',
                weezeventId: '100',
            });

            const result = await service.syncUser(tenantId, 'integration-123', organizationId, userId);

            expect(result.weezeventId).toBe('100');
            expect(mockWeezeventClient.getUser).toHaveBeenCalledWith(
                tenantId,
                organizationId,
                userId,
            );
        });
    });

    describe('syncEvents', () => {
        it('should sync events successfully', async () => {
            const tenantId = 'tenant-123';
            const organizationId = 'org-456';

            const mockEvents = [
                {
                    id: 1,
                    name: 'Music Festival',
                    start_date: '2024-06-01',
                    end_date: '2024-06-03',
                    description: 'Great festival',
                    location: 'Paris',
                    capacity: 10000,
                    status: 'active',
                    metadata: {},
                },
            ];

            mockWeezeventClient.getEvents.mockResolvedValue({
                data: mockEvents,
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 1,
                    total_pages: 1,
                },
            });

            mockPrismaService.weezeventEvent.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventEvent.findMany.mockResolvedValue([]);
            mockPrismaService.weezeventEvent.upsert.mockResolvedValue({
                id: 'event-1',
                weezeventId: '1',
            });

            const result = await service.syncEvents(tenantId, 'integration-123');

            expect(result.success).toBe(true);
            expect(result.itemsSynced).toBe(1);
            expect(result.itemsCreated).toBe(1);
        });
    });

    describe('syncProducts', () => {
        it('should sync products successfully', async () => {
            const tenantId = 'tenant-123';
            const organizationId = 'org-456';

            const mockProducts = [
                {
                    id: 5,
                    name: 'Burger Deluxe',
                    description: 'Delicious burger',
                    category: 'food',
                    base_price: 1200,
                    vat_rate: 10,
                    image: 'https://example.com/burger.jpg',
                    allergens: ['gluten', 'dairy'],
                    components: {},
                    variants: {},
                    metadata: {},
                },
            ];

            mockWeezeventClient.getProducts.mockResolvedValue({
                data: mockProducts,
                meta: {
                    current_page: 1,
                    per_page: 100,
                    total: 1,
                    total_pages: 1,
                },
            });

            mockPrismaService.weezeventProduct.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventProduct.findMany.mockResolvedValue([]);
            mockPrismaService.weezeventProduct.upsert.mockResolvedValue({
                id: 'product-1',
                weezeventId: '5',
            });

            const result = await service.syncProducts(tenantId, 'integration-123');

            expect(result.success).toBe(true);
            expect(result.itemsSynced).toBe(1);
            expect(result.itemsCreated).toBe(1);
        });
    });

    describe('productId resolution in syncTransactionItems', () => {
        const tenantId = 'tenant-123';
        const integrationId = 'integration-123';

        const baseTransaction = {
            id: 100,
            status: 'V',
            created: '2024-06-01T18:00:00Z',
            event_name: 'Match Test',
            fundation_name: 'Buvette Nord',
            location_name: 'Zone Nord',
            location_id: 42,
            seller_id: 1,
            seller_wallet_id: 2,
            rows: [
                {
                    id: 99,
                    item_id: 10,
                    item_name: 'Burger',
                    compound_id: null,
                    unit_price: 1200,
                    vat: 10,
                    reduction: 0,
                    payments: [{ id: 1, wallet_id: 1, amount: 1200, amount_vat: 120, currency_id: 1, quantity: 2, payment_method_id: 1 }],
                },
            ],
        };

        function mockSingleTransactionSync(transactionOverride = {}) {
            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [{ ...baseTransaction, ...transactionOverride }],
                meta: { current_page: 1, per_page: 100, total: 1, total_pages: 1 },
            });
            mockPrismaService.weezeventTransaction.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventTransaction.upsert.mockResolvedValue({ id: 'trans-1' });
            mockPrismaService.weezeventTransactionItem.deleteMany.mockResolvedValue({ count: 0 });
            mockPrismaService.weezeventTransactionItem.createMany.mockResolvedValue({ count: 1 });
            mockPrismaService.weezeventTransactionItem.findMany.mockResolvedValue([
                { id: 'item-1', weezeventItemId: '99' },
            ]);
            mockPrismaService.weezeventPayment.createMany.mockResolvedValue({ count: 1 });
        }

        it('should set productId = null when no products exist in DB', async () => {
            mockSingleTransactionSync();
            // No products in DB
            mockPrismaService.weezeventProduct.findMany.mockResolvedValue([]);

            await service.syncTransactions(tenantId, integrationId);

            expect(mockPrismaService.weezeventTransactionItem.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({ productId: null }),
                    ]),
                }),
            );
        });

        it('should resolve productId from weezeventId when product exists in DB', async () => {
            mockSingleTransactionSync();
            // item_id = 10 → should map to this CUID
            mockPrismaService.weezeventProduct.findMany.mockResolvedValue([
                { id: 'prod-cuid-abc', weezeventId: '10' },
            ]);

            await service.syncTransactions(tenantId, integrationId);

            expect(mockPrismaService.weezeventTransactionItem.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({ productId: 'prod-cuid-abc' }),
                    ]),
                }),
            );
        });

        it('should set productId = null for unknown item_id (no crash)', async () => {
            mockSingleTransactionSync();
            // Only product with id '999' exists — item_id 10 is unknown
            mockPrismaService.weezeventProduct.findMany.mockResolvedValue([
                { id: 'prod-other', weezeventId: '999' },
            ]);

            await expect(service.syncTransactions(tenantId, integrationId)).resolves.not.toThrow();

            expect(mockPrismaService.weezeventTransactionItem.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({ productId: null }),
                    ]),
                }),
            );
        });

        it('should build productIdMap once per sync — not per transaction', async () => {
            // Two transactions, both with item_id 10
            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [
                    { ...baseTransaction, id: 100 },
                    { ...baseTransaction, id: 101 },
                ],
                meta: { current_page: 1, per_page: 100, total: 2, total_pages: 1 },
            });
            mockPrismaService.weezeventTransaction.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventTransaction.upsert.mockResolvedValue({ id: 'trans-x' });
            mockPrismaService.weezeventTransactionItem.deleteMany.mockResolvedValue({ count: 0 });
            mockPrismaService.weezeventTransactionItem.createMany.mockResolvedValue({ count: 1 });
            mockPrismaService.weezeventTransactionItem.findMany.mockResolvedValue([
                { id: 'item-1', weezeventItemId: '99' },
            ]);
            mockPrismaService.weezeventPayment.createMany.mockResolvedValue({ count: 1 });
            mockPrismaService.weezeventProduct.findMany.mockResolvedValue([
                { id: 'prod-cuid-abc', weezeventId: '10' },
            ]);

            await service.syncTransactions(tenantId, integrationId);

            // findMany for products should be called exactly once (not once per transaction)
            expect(mockPrismaService.weezeventProduct.findMany).toHaveBeenCalledTimes(1);
        });
    });
});
