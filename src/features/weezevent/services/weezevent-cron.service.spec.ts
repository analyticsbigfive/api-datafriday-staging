import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventCronService } from './weezevent-cron.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { WeezeventIncrementalSyncService } from './weezevent-incremental-sync.service';
import { SyncTrackerService } from './sync-tracker.service';

describe('WeezeventCronService', () => {
    let service: WeezeventCronService;
    let prisma: PrismaService;
    let syncService: WeezeventSyncService;
    let incrementalSyncService: WeezeventIncrementalSyncService;
    let syncTracker: SyncTrackerService;

    const mockPrismaService = {
        tenant: {
            findMany: jest.fn(),
        },
        weezeventIntegration: {
            findMany: jest.fn(),
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
        getSyncStatus: jest.fn(),
        resetSyncState: jest.fn(),
    };

    const mockSyncTracker = {
        getRunningSyncs: jest.fn().mockReturnValue([]),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventCronService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: WeezeventSyncService, useValue: mockSyncService },
                { provide: WeezeventIncrementalSyncService, useValue: mockIncrementalSyncService },
                { provide: SyncTrackerService, useValue: mockSyncTracker },
            ],
        }).compile();

        service = module.get<WeezeventCronService>(WeezeventCronService);
        prisma = module.get<PrismaService>(PrismaService);
        syncService = module.get<WeezeventSyncService>(WeezeventSyncService);
        incrementalSyncService = module.get<WeezeventIncrementalSyncService>(WeezeventIncrementalSyncService);
        syncTracker = module.get<SyncTrackerService>(SyncTrackerService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('syncRecentTransactions', () => {
        it('should sync transactions incrementally for all enabled tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
                { id: 'tenant-2', name: 'Tenant 2', weezeventOrganizationId: 'org-2' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.weezeventIntegration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({
                type: 'transactions',
                success: true,
                isIncremental: true,
                itemsSynced: 10,
                itemsCreated: 5,
                itemsUpdated: 5,
                itemsSkipped: 0,
                hasMore: false,
                duration: 1000,
            });

            await service.syncRecentTransactions();

            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledTimes(2);
        });

        it('should skip tenant if sync already running', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.weezeventIntegration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockSyncTracker.getRunningSyncs.mockReturnValue([{ type: 'transactions' }]);

            await service.syncRecentTransactions();

            expect(mockIncrementalSyncService.syncTransactionsIncremental).not.toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.weezeventIntegration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncTransactionsIncremental.mockRejectedValue(new Error('API Error'));

            // Should not throw
            await expect(service.syncRecentTransactions()).resolves.not.toThrow();
        });
    });

    describe('syncReferenceData', () => {
        it('should sync events incrementally and products for all enabled tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.weezeventIntegration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({
                type: 'events',
                success: true,
                isIncremental: true,
                itemsSynced: 5,
                itemsSkipped: 2,
            });
            mockSyncService.syncProducts.mockResolvedValue({ itemsSynced: 10 });

            await service.syncReferenceData();

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith('tenant-1', 'integration-1', expect.any(Object));
            expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-1', 'integration-1');
        });
    });

    describe('fullHistoricalSync', () => {
        it('should force full sync for events and transactions', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockPrismaService.weezeventIntegration.findMany.mockResolvedValue([{ id: 'integration-1' }]);
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({
                type: 'events',
                success: true,
                itemsSynced: 100,
            });
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({
                type: 'transactions',
                success: true,
                itemsSynced: 5000,
            });

            await service.fullHistoricalSync();

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith('tenant-1', 'integration-1', expect.objectContaining({
                forceFullSync: true,
            }));
            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith('tenant-1', 'integration-1', expect.objectContaining({
                forceFullSync: true,
            }));
        });
    });

    describe('triggerSync', () => {
        it('should trigger transactions incremental sync', async () => {
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'transactions');

            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({
                    forceFullSync: undefined,
                    batchSize: 500,
                    maxItems: 10000,
                }),
            );
        });

        it('should trigger events incremental sync', async () => {
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'events');

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({
                    forceFullSync: undefined,
                    batchSize: 500,
                    maxItems: 10000,
                }),
            );
        });

        it('should trigger products sync', async () => {
            mockSyncService.syncProducts.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'products');

            expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-1', 'integration-1');
        });

        it('should trigger full sync with forceFullSync option', async () => {
            mockIncrementalSyncService.syncEventsIncremental.mockResolvedValue({ success: true });
            mockIncrementalSyncService.syncTransactionsIncremental.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'integration-1', 'full');

            expect(mockIncrementalSyncService.syncEventsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({ forceFullSync: true }),
            );
            expect(mockIncrementalSyncService.syncTransactionsIncremental).toHaveBeenCalledWith(
                'tenant-1',
                'integration-1',
                expect.objectContaining({ forceFullSync: true }),
            );
        });
    });
});
