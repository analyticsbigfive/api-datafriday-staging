import { Test, TestingModule } from '@nestjs/testing';
import { WeezeventCronService } from './weezevent-cron.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { WeezeventSyncService } from './weezevent-sync.service';
import { SyncTrackerService } from './sync-tracker.service';

describe('WeezeventCronService', () => {
    let service: WeezeventCronService;
    let prisma: PrismaService;
    let syncService: WeezeventSyncService;
    let syncTracker: SyncTrackerService;

    const mockPrismaService = {
        tenant: {
            findMany: jest.fn(),
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
            providers: [
                WeezeventCronService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: WeezeventSyncService, useValue: mockSyncService },
                { provide: SyncTrackerService, useValue: mockSyncTracker },
            ],
        }).compile();

        service = module.get<WeezeventCronService>(WeezeventCronService);
        prisma = module.get<PrismaService>(PrismaService);
        syncService = module.get<WeezeventSyncService>(WeezeventSyncService);
        syncTracker = module.get<SyncTrackerService>(SyncTrackerService);

        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('syncRecentTransactions', () => {
        it('should sync transactions for all enabled tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
                { id: 'tenant-2', name: 'Tenant 2', weezeventOrganizationId: 'org-2' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockSyncService.syncTransactions.mockResolvedValue({
                type: 'transactions',
                success: true,
                itemsSynced: 10,
                itemsCreated: 5,
                itemsUpdated: 5,
            });

            await service.syncRecentTransactions();

            expect(mockPrismaService.tenant.findMany).toHaveBeenCalledWith({
                where: {
                    weezeventEnabled: true,
                    weezeventOrganizationId: { not: null },
                    weezeventClientId: { not: null },
                    weezeventClientSecret: { not: null },
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                    name: true,
                    weezeventOrganizationId: true,
                },
            });

            expect(mockSyncService.syncTransactions).toHaveBeenCalledTimes(2);
        });

        it('should skip tenant if sync already running', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockSyncTracker.getRunningSyncs.mockReturnValue([{ type: 'transactions' }]);

            await service.syncRecentTransactions();

            expect(mockSyncService.syncTransactions).not.toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockSyncService.syncTransactions.mockRejectedValue(new Error('API Error'));

            // Should not throw
            await expect(service.syncRecentTransactions()).resolves.not.toThrow();
        });
    });

    describe('syncReferenceData', () => {
        it('should sync events and products for all enabled tenants', async () => {
            const mockTenants = [
                { id: 'tenant-1', name: 'Tenant 1', weezeventOrganizationId: 'org-1' },
            ];

            mockPrismaService.tenant.findMany.mockResolvedValue(mockTenants);
            mockSyncService.syncEvents.mockResolvedValue({ itemsSynced: 5 });
            mockSyncService.syncProducts.mockResolvedValue({ itemsSynced: 10 });

            await service.syncReferenceData();

            expect(mockSyncService.syncEvents).toHaveBeenCalledWith('tenant-1');
            expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-1');
        });
    });

    describe('triggerSync', () => {
        it('should trigger transactions sync', async () => {
            mockSyncService.syncTransactions.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'transactions');

            expect(mockSyncService.syncTransactions).toHaveBeenCalledWith(
                'tenant-1',
                expect.objectContaining({ fromDate: expect.any(Date) }),
            );
        });

        it('should trigger events sync', async () => {
            mockSyncService.syncEvents.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'events');

            expect(mockSyncService.syncEvents).toHaveBeenCalledWith('tenant-1');
        });

        it('should trigger products sync', async () => {
            mockSyncService.syncProducts.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'products');

            expect(mockSyncService.syncProducts).toHaveBeenCalledWith('tenant-1');
        });

        it('should trigger full sync with 30 days', async () => {
            mockSyncService.syncTransactions.mockResolvedValue({ success: true });

            await service.triggerSync('tenant-1', 'full');

            expect(mockSyncService.syncTransactions).toHaveBeenCalledWith(
                'tenant-1',
                expect.objectContaining({ full: true }),
            );
        });
    });
});
