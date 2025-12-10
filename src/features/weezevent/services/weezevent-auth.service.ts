import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { OnboardingService } from '../../onboarding/onboarding.service';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';
import {
    WeezeventConfig,
    WeezeventTokenResponse,
} from '../interfaces/weezevent.interface';

interface TokenCache {
    token: string;
    expiresAt: Date;
}

@Injectable()
export class WeezeventAuthService {
    private readonly logger = new Logger(WeezeventAuthService.name);
    private readonly tokenCache = new Map<string, TokenCache>();
    private readonly authUrl = 'https://accounts.weezevent.com/realms/accounts/protocol/openid-connect/token';

    constructor(
        private readonly httpService: HttpService,
        private readonly onboardingService: OnboardingService,
    ) { }

    /**
     * Get access token for a tenant
     * Returns cached token if still valid, otherwise requests a new one
     */
    async getAccessToken(tenantId: string): Promise<string> {
        const cached = this.tokenCache.get(tenantId);

        // Return cached token if still valid (with 60s buffer)
        if (cached && cached.expiresAt > new Date()) {
            this.logger.debug(`Using cached token for tenant ${tenantId}`);
            return cached.token;
        }

        // Request new token
        this.logger.log(`Requesting new access token for tenant ${tenantId}`);
        return this.requestNewToken(tenantId);
    }

    /**
     * Clear cached token for a tenant
     */
    clearToken(tenantId: string): void {
        this.tokenCache.delete(tenantId);
        this.logger.debug(`Cleared token cache for tenant ${tenantId}`);
    }

    /**
     * Request a new access token from Weezevent
     */
    private async requestNewToken(tenantId: string): Promise<string> {
        // Get Weezevent config for this tenant
        const config = await this.getWeezeventConfig(tenantId);

        try {
            // Create Basic Auth header
            const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
            
            // Request token using client credentials grant with Basic Auth
            const response = await this.httpService.axiosRef.post<WeezeventTokenResponse>(
                this.authUrl,
                new URLSearchParams({
                    grant_type: 'client_credentials',
                }),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                },
            );

            const { access_token, expires_in } = response.data;

            // Cache token with 60s buffer before expiry
            const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000);
            this.tokenCache.set(tenantId, {
                token: access_token,
                expiresAt,
            });

            this.logger.log(
                `Successfully obtained access token for tenant ${tenantId}, expires at ${expiresAt.toISOString()}`,
            );

            return access_token;
        } catch (error) {
            this.logger.error(
                `Failed to obtain access token for tenant ${tenantId}`,
                error.stack,
            );

            if (error.response) {
                const { status, data } = error.response;
                throw new WeezeventAuthException(
                    `Authentication failed (${status}): ${data?.error_description || data?.error || 'Unknown error'}`,
                );
            }

            throw new WeezeventAuthException(
                `Authentication failed: ${error.message}`,
            );
        }
    }

    /**
     * Get Weezevent configuration for a tenant
     */
    private async getWeezeventConfig(tenantId: string): Promise<WeezeventConfig> {
        const config = await this.onboardingService.getWeezeventConfig(tenantId);

        if (!config) {
            throw new WeezeventAuthException(
                `Weezevent not configured for tenant ${tenantId}`,
            );
        }

        if (!config.enabled) {
            throw new WeezeventAuthException(
                `Weezevent integration is disabled for tenant ${tenantId}`,
            );
        }

        return config;
    }
}
