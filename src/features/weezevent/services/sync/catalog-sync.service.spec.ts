import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventCatalogSyncService } from './catalog-sync.service';
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

const mockApiEvent = {
    id: 10,
    name: 'Festival 2025',
    start_date: '2025-06-01T10:00:00Z',
    end_date: '2025-06-03T22:00:00Z',
    location: 'Paris, France',
    status: 'open',
    capacity: 5000,
};

const mockApiProduct = {
    id: 7,
    name: 'VIP Pass',
    type: 'ticket',
    active: true,
    variants: [],
    components: [],
};

function makePrismaMock() {
    return {
        weezeventIntegration: {
            findUnique: jest.fn().mockResolvedValue(mockIntegration),
        },
        weezeventEvent: {
            findMany: jest.fn().mockResolvedValue([]),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
        },
        weezeventProduct: {
            findMany: jest.fn().mockResolvedValue([]),
            // Return null so syncProductDetails() returns early without more mock setup
            findUnique: jest.fn().mockResolvedValue(null),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
            upsert: jest.fn().mockResolvedValue({ id: 'prod-1', weezeventId: '7' }),
        },
        weezeventSyncState: {
            upsert: jest.fn().mockResolvedValue({}),
        },
        // prisma.$transaction runs all provided operations sequentially in tests
        $transaction: jest.fn().mockImplementation((ops: any[]) =>
            Promise.all(Array.isArray(ops) ? ops : [ops]),
        ),
    };
}

function makeClientMock() {
    return {
        getEvents: jest.fn().mockResolvedValue({
            data: [mockApiEvent],
            meta: { total_pages: 1, current_page: 1, total: 1 },
        }),
        getProducts: jest.fn().mockResolvedValue({
            data: [mockApiProduct],
            meta: { total_pages: 1, current_page: 1, total: 1 },
        }),
        getProductDetails: jest.fn().mockResolvedValue(mockApiProduct),
        // syncProductDetails calls these; returning empty arrays is fine
        getProductVariants: jest.fn().mockResolvedValue([]),
        getProductComponents: jest.fn().mockResolvedValue([]),
    };
}

describe('WeezeventCatalogSyncService', () => {
    let service: WeezeventCatalogSyncService;
    let prisma: ReturnType<typeof makePrismaMock>;
    let client: ReturnType<typeof makeClientMock>;

    beforeEach(async () => {
        prisma = makePrismaMock();
        client = makeClientMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventCatalogSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: WeezeventClientService, useValue: client },
            ],
        }).compile();

        service = module.get(WeezeventCatalogSyncService);
    });

    // ─── syncEvents ───────────────────────────────────────────────────────────

    describe('syncEvents()', () => {
        it('returns a successful SyncResult', async () => {
            const result = await service.syncEvents(TENANT_ID, INTEGRATION_ID);

            expect(result.success).toBe(true);
            expect(result.type).toBe('events');
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });

        it('counts created events', async () => {
            // No pre-existing events → all will be created
            prisma.weezeventEvent.findMany.mockResolvedValue([]);

            const result = await service.syncEvents(TENANT_ID, INTEGRATION_ID);

            expect(result.itemsCreated).toBe(1);
            expect(result.itemsUpdated).toBe(0);
        });

        it('counts updated events', async () => {
            // One event already exists → will be updated
            prisma.weezeventEvent.findMany.mockResolvedValue([{ weezeventId: '10' }]);

            const result = await service.syncEvents(TENANT_ID, INTEGRATION_ID);

            expect(result.itemsUpdated).toBe(1);
            expect(result.itemsCreated).toBe(0);
        });

        it('throws if integration is not found', async () => {
            prisma.weezeventIntegration.findUnique.mockResolvedValue(null);
            await expect(service.syncEvents(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/not found/);
        });

        it('throws if organization ID is missing', async () => {
            prisma.weezeventIntegration.findUnique.mockResolvedValue({
                ...mockIntegration,
                organizationId: null,
            });
            await expect(service.syncEvents(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/organization/i);
        });

        it('calls getEvents with the correct organizationId', async () => {
            await service.syncEvents(TENANT_ID, INTEGRATION_ID);

            expect(client.getEvents).toHaveBeenCalledWith(
                TENANT_ID,
                ORG_ID,
                expect.any(Object),
            );
        });
    });

    // ─── syncProducts ─────────────────────────────────────────────────────────

    describe('syncProducts()', () => {
        it('returns a successful SyncResult', async () => {
            const result = await service.syncProducts(TENANT_ID, INTEGRATION_ID);

            expect(result.success).toBe(true);
            expect(result.type).toBe('products');
        });

        it('counts synced products', async () => {
            const result = await service.syncProducts(TENANT_ID, INTEGRATION_ID);

            expect(result.itemsSynced).toBeGreaterThanOrEqual(1);
        });

        it('throws if integration is not found', async () => {
            prisma.weezeventIntegration.findUnique.mockResolvedValue(null);
            await expect(service.syncProducts(TENANT_ID, INTEGRATION_ID)).rejects.toThrow(/not found/);
        });

        it('calls getProducts with the correct organizationId', async () => {
            await service.syncProducts(TENANT_ID, INTEGRATION_ID);

            expect(client.getProducts).toHaveBeenCalledWith(
                TENANT_ID,
                ORG_ID,
                expect.any(Object),
            );
        });

        it('upserts each product into the database', async () => {
            await service.syncProducts(TENANT_ID, INTEGRATION_ID);

            expect(prisma.weezeventProduct.createMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.arrayContaining([
                        expect.objectContaining({ weezeventId: '7' }),
                    ]),
                }),
            );
        });
    });
});
