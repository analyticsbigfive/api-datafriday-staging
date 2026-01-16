import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventIncrementalSyncService } from './weezevent-incremental-sync.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventClientService } from './weezevent-client.service';

describe('WeezeventIncrementalSyncService', () => {
    let service: WeezeventIncrementalSyncService;

    const mockPrismaService = {
        tenant: {
            findUnique: jest.fn(),
        },
        weezeventSyncState: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
            findMany: jest.fn(),
            deleteMany: jest.fn(),
        },
        weezeventEvent: {
            findMany: jest.fn(),
            createMany: jest.fn(),
            update: jest.fn(),
        },
        weezeventTransaction: {
            findMany: jest.fn(),
            createMany: jest.fn(),
        },
        $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const mockWeezeventClient = {
        getEvents: jest.fn(),
        getTransactions: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventIncrementalSyncService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: WeezeventClientService, useValue: mockWeezeventClient },
            ],
        }).compile();

        service = module.get<WeezeventIncrementalSyncService>(WeezeventIncrementalSyncService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('syncEventsIncremental', () => {
        const tenantId = 'tenant-123';
        const organizationId = 'org-456';

        beforeEach(() => {
            mockPrismaService.tenant.findUnique.mockResolvedValue({
                id: tenantId,
                weezeventOrganizationId: organizationId,
                weezeventEnabled: true,
            });
        });

        it('should perform FULL sync when no previous sync state exists', async () => {
            // No previous sync state
            mockPrismaService.weezeventSyncState.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventEvent.findMany.mockResolvedValue([]);

            mockWeezeventClient.getEvents.mockResolvedValue({
                data: [
                    { id: 1, name: 'Event 1', status: 'active' },
                    { id: 2, name: 'Event 2', status: 'active' },
                ],
                meta: { current_page: 1, per_page: 100, total: 2, total_pages: 1 },
            });

            mockPrismaService.weezeventEvent.createMany.mockResolvedValue({ count: 2 });

            const result = await service.syncEventsIncremental(tenantId);

            // First sync without previous state = incremental false only if forceFullSync
            // But since no lastSyncedAt, useIncremental = false
            expect(result.itemsCreated).toBe(2);
            expect(result.success).toBe(true);
        });

        it('should perform INCREMENTAL sync when previous sync state exists', async () => {
            const lastSync = new Date(Date.now() - 3600000); // 1 hour ago

            mockPrismaService.weezeventSyncState.findUnique.mockResolvedValue({
                tenantId,
                syncType: 'events',
                lastSyncedAt: lastSync,
                lastUpdatedAt: lastSync,
            });

            // One existing event
            mockPrismaService.weezeventEvent.findMany.mockResolvedValue([
                { weezeventId: '1', syncedAt: lastSync },
            ]);

            // API returns one new event and one existing
            mockWeezeventClient.getEvents.mockResolvedValue({
                data: [
                    { id: 1, name: 'Event 1 Updated', status: 'active', updated_at: new Date().toISOString() },
                    { id: 3, name: 'New Event', status: 'active' },
                ],
                meta: { current_page: 1, per_page: 100, total: 2, total_pages: 1 },
            });

            mockPrismaService.weezeventEvent.createMany.mockResolvedValue({ count: 1 });

            const result = await service.syncEventsIncremental(tenantId);

            expect(result.isIncremental).toBe(true);
            expect(result.itemsCreated).toBe(1); // Only new event
            expect(result.success).toBe(true);
        });

        it('should skip events that have not been updated', async () => {
            const lastSync = new Date();

            mockPrismaService.weezeventSyncState.findUnique.mockResolvedValue({
                tenantId,
                syncType: 'events',
                lastSyncedAt: lastSync,
                lastUpdatedAt: lastSync,
            });

            // Existing event synced recently
            mockPrismaService.weezeventEvent.findMany.mockResolvedValue([
                { weezeventId: '1', syncedAt: lastSync },
            ]);

            // API returns same event with older updated_at
            mockWeezeventClient.getEvents.mockResolvedValue({
                data: [
                    { 
                        id: 1, 
                        name: 'Event 1', 
                        updated_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
                    },
                ],
                meta: { current_page: 1, per_page: 100, total: 1, total_pages: 1 },
            });

            const result = await service.syncEventsIncremental(tenantId);

            expect(result.itemsSkipped).toBe(1);
            expect(result.itemsCreated).toBe(0);
            expect(result.itemsUpdated).toBe(0);
        });

        it('should force full sync when forceFullSync option is true', async () => {
            mockPrismaService.weezeventSyncState.findUnique.mockResolvedValue({
                tenantId,
                syncType: 'events',
                lastSyncedAt: new Date(),
            });

            mockPrismaService.weezeventEvent.findMany.mockResolvedValue([]);

            mockWeezeventClient.getEvents.mockResolvedValue({
                data: [{ id: 1, name: 'Event 1' }],
                meta: { current_page: 1, per_page: 100, total: 1, total_pages: 1 },
            });

            mockPrismaService.weezeventEvent.createMany.mockResolvedValue({ count: 1 });

            const result = await service.syncEventsIncremental(tenantId, {
                forceFullSync: true,
            });

            expect(result.isIncremental).toBe(false);
        });

        it('should respect maxItems limit', async () => {
            mockPrismaService.weezeventSyncState.findUnique.mockResolvedValue(null);
            mockPrismaService.weezeventEvent.findMany.mockResolvedValue([]);

            // First page
            mockWeezeventClient.getEvents.mockResolvedValueOnce({
                data: Array(100).fill(null).map((_, i) => ({ id: i, name: `Event ${i}` })),
                meta: { current_page: 1, per_page: 100, total: 200, total_pages: 2 },
            });

            mockPrismaService.weezeventEvent.createMany.mockResolvedValue({ count: 100 });

            const result = await service.syncEventsIncremental(tenantId, {
                maxItems: 100, // Limit to 100
            });

            expect(result.hasMore).toBe(true); // More data available
            expect(mockWeezeventClient.getEvents).toHaveBeenCalledTimes(1); // Only 1 page fetched
        });
    });

    describe('syncTransactionsIncremental', () => {
        const tenantId = 'tenant-123';

        beforeEach(() => {
            mockPrismaService.tenant.findUnique.mockResolvedValue({
                id: tenantId,
                weezeventOrganizationId: 'org-456',
                weezeventEnabled: true,
            });
        });

        it('should only fetch new transactions in incremental mode', async () => {
            const lastSync = new Date(Date.now() - 3600000);

            mockPrismaService.weezeventSyncState.findUnique.mockResolvedValue({
                tenantId,
                syncType: 'transactions',
                lastSyncedAt: lastSync,
            });

            // Existing transaction IDs
            mockPrismaService.weezeventTransaction.findMany.mockResolvedValue([
                { weezeventId: '1' },
                { weezeventId: '2' },
            ]);

            // API returns mix of existing and new
            mockWeezeventClient.getTransactions.mockResolvedValue({
                data: [
                    { id: 1, amount: 10, status: 'V', date: new Date().toISOString() },
                    { id: 2, amount: 20, status: 'V', date: new Date().toISOString() },
                    { id: 3, amount: 30, status: 'V', date: new Date().toISOString() }, // New
                ],
                meta: { current_page: 1, per_page: 100, total: 3, total_pages: 1 },
            });

            mockPrismaService.weezeventTransaction.createMany.mockResolvedValue({ count: 1 });

            const result = await service.syncTransactionsIncremental(tenantId);

            expect(result.isIncremental).toBe(true);
            expect(result.itemsCreated).toBe(1); // Only new transaction
            expect(result.itemsSkipped).toBe(2); // Existing ones skipped
        });
    });

    describe('getSyncStatus', () => {
        it('should return sync status for all types', async () => {
            mockPrismaService.weezeventSyncState.findMany.mockResolvedValue([
                {
                    syncType: 'events',
                    lastSyncedAt: new Date(),
                    lastSyncCount: 100,
                    totalSynced: 1000,
                },
                {
                    syncType: 'transactions',
                    lastSyncedAt: new Date(),
                    lastSyncCount: 50,
                    totalSynced: 5000,
                },
            ]);

            const status = await service.getSyncStatus('tenant-123');

            expect(status.events).toBeDefined();
            expect(status.transactions).toBeDefined();
            expect(status.events.totalSynced).toBe(1000);
        });
    });

    describe('resetSyncState', () => {
        it('should delete sync state for specific type', async () => {
            await service.resetSyncState('tenant-123', 'events');

            expect(mockPrismaService.weezeventSyncState.deleteMany).toHaveBeenCalledWith({
                where: { tenantId: 'tenant-123', syncType: 'events' },
            });
        });

        it('should delete all sync states when no type specified', async () => {
            await service.resetSyncState('tenant-123');

            expect(mockPrismaService.weezeventSyncState.deleteMany).toHaveBeenCalledWith({
                where: { tenantId: 'tenant-123' },
            });
        });
    });
});
