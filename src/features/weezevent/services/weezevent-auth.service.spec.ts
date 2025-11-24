import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { WeezeventAuthService } from './weezevent-auth.service';
import { OnboardingService } from '../../onboarding/onboarding.service';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('WeezeventAuthService', () => {
    let service: WeezeventAuthService;
    let httpService: HttpService;
    let onboardingService: OnboardingService;

    const mockHttpService = {
        axiosRef: {
            post: jest.fn(),
        },
    };

    const mockOnboardingService = {
        getWeezeventConfig: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WeezeventAuthService,
                {
                    provide: HttpService,
                    useValue: mockHttpService,
                },
                {
                    provide: OnboardingService,
                    useValue: mockOnboardingService,
                },
            ],
        }).compile();

        service = module.get<WeezeventAuthService>(WeezeventAuthService);
        httpService = module.get<HttpService>(HttpService);
        onboardingService = module.get<OnboardingService>(OnboardingService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getAccessToken', () => {
        const tenantId = 'tenant-123';
        const mockConfig = {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            enabled: true,
        };

        const mockTokenResponse = {
            access_token: 'mock-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'transactions.read wallets.read',
        };

        it('should request and cache access token', async () => {
            mockOnboardingService.getWeezeventConfig.mockResolvedValue(mockConfig);
            mockHttpService.axiosRef.post.mockResolvedValue({
                data: mockTokenResponse,
            });

            const token = await service.getAccessToken(tenantId);

            expect(token).toBe('mock-access-token');
            expect(mockHttpService.axiosRef.post).toHaveBeenCalledWith(
                'https://api.weezevent.com/oauth/token',
                expect.any(URLSearchParams),
                expect.objectContaining({
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                }),
            );
        });

        it('should return cached token if still valid', async () => {
            mockOnboardingService.getWeezeventConfig.mockResolvedValue(mockConfig);
            mockHttpService.axiosRef.post.mockResolvedValue({
                data: mockTokenResponse,
            });

            // First call - should request token
            const token1 = await service.getAccessToken(tenantId);

            // Second call - should return cached token
            const token2 = await service.getAccessToken(tenantId);

            expect(token1).toBe(token2);
            expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(1);
        });

        it('should throw WeezeventAuthException if config not found', async () => {
            mockOnboardingService.getWeezeventConfig.mockResolvedValue(null);

            await expect(service.getAccessToken(tenantId)).rejects.toThrow(
                WeezeventAuthException,
            );
            await expect(service.getAccessToken(tenantId)).rejects.toThrow(
                'Weezevent not configured',
            );
        });

        it('should throw WeezeventAuthException if integration disabled', async () => {
            mockOnboardingService.getWeezeventConfig.mockResolvedValue({
                ...mockConfig,
                enabled: false,
            });

            await expect(service.getAccessToken(tenantId)).rejects.toThrow(
                WeezeventAuthException,
            );
            await expect(service.getAccessToken(tenantId)).rejects.toThrow(
                'integration is disabled',
            );
        });

        it('should throw WeezeventAuthException on auth failure', async () => {
            mockOnboardingService.getWeezeventConfig.mockResolvedValue(mockConfig);
            mockHttpService.axiosRef.post.mockRejectedValue({
                response: {
                    status: 401,
                    data: { error: 'invalid_client' },
                },
            });

            await expect(service.getAccessToken(tenantId)).rejects.toThrow(
                WeezeventAuthException,
            );
        });
    });

    describe('clearToken', () => {
        it('should clear cached token for tenant', async () => {
            const tenantId = 'tenant-123';
            const mockConfig = {
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                enabled: true,
            };

            mockOnboardingService.getWeezeventConfig.mockResolvedValue(mockConfig);
            mockHttpService.axiosRef.post.mockResolvedValue({
                data: {
                    access_token: 'token',
                    expires_in: 3600,
                },
            });

            // Get token (cached)
            await service.getAccessToken(tenantId);

            // Clear cache
            service.clearToken(tenantId);

            // Next call should request new token
            await service.getAccessToken(tenantId);

            expect(mockHttpService.axiosRef.post).toHaveBeenCalledTimes(2);
        });
    });
});
