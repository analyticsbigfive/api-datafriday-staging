import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WeezeventIntegrationService } from './weezevent-integration.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';

describe('WeezeventIntegrationService', () => {
    let service: WeezeventIntegrationService;

    const mockPrismaService: any = {
        tenant: {
            findUnique: jest.fn(),
            update: jest.fn().mockResolvedValue({}),
        },
        weezeventIntegration: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            delete: jest.fn(),
        },
    };

    const mockEncryptionService = {
        encrypt: jest.fn().mockReturnValue('encrypted-secret'),
        decrypt: jest.fn().mockReturnValue('decrypted-secret'),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventIntegrationService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: EncryptionService, useValue: mockEncryptionService },
            ],
        }).compile();

        service = module.get<WeezeventIntegrationService>(WeezeventIntegrationService);
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createInstance', () => {
        it('creates a new instance and mirrors to tenant', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'org-123' });
            const created = {
                id: 'inst-1',
                name: 'My Event',
                clientId: 'client-1',
                organizationId: 'weez-1',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockPrismaService.weezeventIntegration.create.mockResolvedValue(created);
            mockPrismaService.weezeventIntegration.findFirst.mockResolvedValue({
                ...created,
                clientSecret: 'encrypted-secret',
            });

            const result = await service.createInstance('org-123', {
                name: 'My Event',
                clientId: 'client-1',
                clientSecret: 'secret',
                organizationId: 'weez-1',
            });

            expect(result.id).toBe('inst-1');
            expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('secret');
            expect(mockPrismaService.tenant.update).toHaveBeenCalled();
        });

        it('throws NotFound when tenant missing', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue(null);
            await expect(
                service.createInstance('missing', {
                    name: 'X',
                    clientId: 'c',
                    clientSecret: 's',
                }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateInstance', () => {
        it('keeps existing secret when clientSecret omitted', async () => {
            mockPrismaService.weezeventIntegration.findFirst.mockResolvedValue({ id: 'inst-1' });
            mockPrismaService.weezeventIntegration.update.mockResolvedValue({
                id: 'inst-1',
                name: 'Renamed',
                clientId: 'client-1',
                organizationId: 'weez-1',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await service.updateInstance('org-123', 'inst-1', { name: 'Renamed' });

            expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
        });

        it('encrypts clientSecret when provided', async () => {
            mockPrismaService.weezeventIntegration.findFirst.mockResolvedValue({ id: 'inst-1' });
            mockPrismaService.weezeventIntegration.update.mockResolvedValue({
                id: 'inst-1',
                name: 'X',
                clientId: 'c',
                organizationId: null,
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await service.updateInstance('org-123', 'inst-1', { clientSecret: 'new-secret' });

            expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('new-secret');
        });

        it('throws NotFound when instance missing', async () => {
            mockPrismaService.weezeventIntegration.findFirst.mockResolvedValue(null);
            await expect(
                service.updateInstance('org-123', 'missing', { name: 'X' }),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteInstance', () => {
        it('deletes and disables tenant when no more instances', async () => {
            mockPrismaService.weezeventIntegration.findFirst
                .mockResolvedValueOnce({ id: 'inst-1' })
                .mockResolvedValueOnce(null);
            mockPrismaService.weezeventIntegration.delete.mockResolvedValue({});

            await service.deleteInstance('org-123', 'inst-1');

            expect(mockPrismaService.tenant.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ weezeventEnabled: false }),
                }),
            );
        });
    });

    describe('getConfig (legacy)', () => {
        it('returns first enabled instance when present', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 'org-123' });
            mockPrismaService.weezeventIntegration.findFirst.mockResolvedValueOnce({
                id: 'inst-1',
                clientId: 'c1',
                organizationId: 'o1',
                enabled: true,
            });

            const result = await service.getConfig('org-123');
            expect(result).toEqual({
                clientId: 'c1',
                organizationId: 'o1',
                enabled: true,
                configured: true,
            });
        });

        it('throws NotFound when tenant missing', async () => {
            mockPrismaService.tenant.findUnique.mockResolvedValue(null);
            await expect(service.getConfig('missing')).rejects.toThrow(NotFoundException);
        });
    });
});
