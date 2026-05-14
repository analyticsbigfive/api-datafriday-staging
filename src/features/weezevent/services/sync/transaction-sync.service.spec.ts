import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventTransactionSyncService } from './transaction-sync.service';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';

const TENANT_ID = 'tenant-001';
const INTEGRATION_ID = 'integ-001';
const ORG_ID = 'org-001';

const mockIntegration = {
    id: INTEGRATION_ID,
    tenantId: TENANT_ID,
    organizationId: ORG_ID,
    enabled: true,
};

const mockApiTransaction = {
    id: 'tx-1',
    transaction_id: 'tx-1',
    event_id: 42,
    event_name: 'Test Event',
    total_amount: 1000,
    currency: 'EUR',
    status: 'confirmed',
    created_at: '2024-01-01T12:00:00Z',
    // Service iterates over `rows` (WeezeventTransaction interface field),
    // using `item_id` as the product weezeventId
    rows: [
        {
            id: 1,
            item_id: 7,
            item_name: 'VIP Ticket',
            compound_id: 0,
            component: false,
            unit_price: 500,
            vat: 0,
            reduction: 0,
            payments: [],
        },
    ],
};

function makePrismaMock() {
    return {
        weezeventIntegration: {
            findUnique: jest.fn().mockResolvedValue(mockIntegration),
        },
        weezeventProduct: {
            findMany: jest.fn().mockResolvedValue([]),
            upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `prod-${create.weezeventId}`, weezeventId: create.weezeventId })),
        },
        weezeventEvent: {
            findMany: jest.fn().mockResolvedValue([]),
            upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `evt-${create.weezeventId}`, weezeventId: create.weezeventId })),
        },
        weezeventLocation: {
            upsert: jest.fn().mockResolvedValue({ id: 'loc-1' }),
        },
        weezeventTransaction: {
            upsert: jest.fn().mockResolvedValue({ id: 'tx-db-1', weezeventId: 'tx-1' }),
            findUnique: jest.fn().mockResolvedValue(null),
        },
        weezeventTransactionItem: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue([]),
        },
        weezeventPayment: {
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
    };
}

function makeClientMock() {
    return {
        getTransactions: jest.fn().mockResolvedValue({
            data: [mockApiTransaction],
            meta: { total_pages: 1, current_page: 1, total: 1 },
        }),
        getTransaction: jest.fn().mockResolvedValue(mockApiTransaction),
    };
}

describe('WeezeventTransactionSyncService', () => {
    let service: WeezeventTransactionSyncService;
    let prisma: ReturnType<typeof makePrismaMock>;
    let client: ReturnType<typeof makeClientMock>;

    beforeEach(async () => {
        prisma = makePrismaMock();
        client = makeClientMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventTransactionSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: WeezeventClientService, useValue: client },
            ],
        }).compile();

        service = module.get(WeezeventTransactionSyncService);
    });

    // ─── syncTransactions ─────────────────────────────────────────────────────

    describe('syncTransactions()', () => {
        it('returns a successful SyncResult after syncing one transaction', async () => {
            const result = await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            expect(result.success).toBe(true);
            expect(result.type).toBe('transactions');
            expect(result.itemsSynced).toBeGreaterThanOrEqual(1);
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('upserts an event inline when the transaction carries event data', async () => {
            await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            expect(prisma.weezeventEvent.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tenantId_integrationId_weezeventId: expect.objectContaining({
                            weezeventId: '42',
                        }),
                    }),
                }),
            );
        });

        it('upserts a product inline when the transaction item carries product data', async () => {
            await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            expect(prisma.weezeventProduct.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tenantId_integrationId_weezeventId: expect.objectContaining({
                            weezeventId: '7',
                        }),
                    }),
                }),
            );
        });

        it('skips duplicate event upserts across pages (seenEventWids guard)', async () => {
            // Two transactions for the same event
            client.getTransactions.mockResolvedValue({
                data: [mockApiTransaction, { ...mockApiTransaction, id: 'tx-2', transaction_id: 'tx-2' }],
                meta: { total_pages: 1, current_page: 1, total: 2 },
            });

            await service.syncTransactions(TENANT_ID, INTEGRATION_ID);

            // Event 42 should only be upserted once (seenEventWids guard)
            const eventUpsertCalls = (prisma.weezeventEvent.upsert as jest.Mock).mock.calls.filter(
                ([args]) => args.where?.tenantId_integrationId_weezeventId?.weezeventId === '42',
            );
            expect(eventUpsertCalls.length).toBe(1);
        });

        it('throws if integration is not found', async () => {
            prisma.weezeventIntegration.findUnique.mockResolvedValue(null);
            await expect(service.syncTransactions(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/not found/);
        });

        it('throws if integration is disabled', async () => {
            prisma.weezeventIntegration.findUnique.mockResolvedValue({ ...mockIntegration, enabled: false });
            await expect(service.syncTransactions(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/disabled/);
        });

        it('does not throw when transaction items are null (null guard)', async () => {
            client.getTransactions.mockResolvedValue({
                data: [{ ...mockApiTransaction, items: null }],
                meta: { total_pages: 1, current_page: 1, total: 1 },
            });

            await expect(service.syncTransactions(TENANT_ID, INTEGRATION_ID)).resolves.toMatchObject({
                success: true,
            });
        });
    });

    // ─── syncSingleTransaction ────────────────────────────────────────────────

    describe('syncSingleTransaction()', () => {
        it('returns created: false when the transaction already exists', async () => {
            prisma.weezeventTransaction.findUnique.mockResolvedValue({ id: 'tx-db-1' });

            const result = await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(result.created).toBe(false);
        });

        it('returns created: true for a brand-new transaction', async () => {
            // findUnique returns null → transaction is new
            prisma.weezeventTransaction.findUnique.mockResolvedValue(null);

            const result = await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(result.created).toBe(true);
        });

        it('upserts the event inline when the single transaction carries event data', async () => {
            prisma.weezeventTransaction.findUnique.mockResolvedValue(null);

            await service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1');

            expect(prisma.weezeventEvent.upsert).toHaveBeenCalled();
        });

        it('throws if integration is not found', async () => {
            prisma.weezeventIntegration.findUnique.mockResolvedValue(null);

            await expect(
                service.syncSingleTransaction(TENANT_ID, INTEGRATION_ID, 'tx-1'),
            ).rejects.toThrow(/not found/);
        });
    });
});
