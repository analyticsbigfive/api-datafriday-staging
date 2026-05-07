import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WeezeventAuthService } from './weezevent-auth.service';
import { WeezeventApiException } from '../exceptions/weezevent-api.exception';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import CircuitBreaker from 'opossum';

@Injectable()
export class WeezeventApiService {
    private readonly logger = new Logger(WeezeventApiService.name);
    private readonly baseUrl = 'https://api.weezevent.com/pay/v1';
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000; // ms

    /**
     * Circuit breaker partagé pour tous les appels Weezevent.
     * Évite l'effondrement en cascade quand l'API est down (10k+ users × retries).
     *  - opens after 50% errors over 10 calls
     *  - resetTimeout: tente une réouverture après 30s
     */
    private readonly breaker: CircuitBreaker<[AxiosRequestConfig], AxiosResponse<any>>;

    constructor(
        private readonly httpService: HttpService,
        private readonly authService: WeezeventAuthService,
    ) {
        this.breaker = new CircuitBreaker(
            (config: AxiosRequestConfig) => this.httpService.axiosRef.request(config),
            {
                timeout: Number(process.env.WEEZEVENT_HTTP_TIMEOUT_MS || 15000),
                errorThresholdPercentage: Number(process.env.WEEZEVENT_BREAKER_THRESHOLD || 50),
                resetTimeout: Number(process.env.WEEZEVENT_BREAKER_RESET_MS || 30000),
                volumeThreshold: 10,
                rollingCountTimeout: 10000,
                name: 'weezevent-api',
            },
        );
        this.breaker.on('open', () =>
            this.logger.error('🔴 Circuit breaker OPEN — appels Weezevent suspendus 30s'),
        );
        this.breaker.on('halfOpen', () =>
            this.logger.warn('🟡 Circuit breaker HALF-OPEN — test de récupération'),
        );
        this.breaker.on('close', () =>
            this.logger.log('🟢 Circuit breaker CLOSED — Weezevent opérationnel'),
        );
    }

    /**
     * Execute GET request
     */
    async get<T>(
        tenantId: string,
        endpoint: string,
        params?: Record<string, any>,
    ): Promise<T> {
        return this.request<T>(tenantId, 'GET', endpoint, { params });
    }

    /**
     * Execute POST request
     */
    async post<T>(
        tenantId: string,
        endpoint: string,
        data?: any,
    ): Promise<T> {
        return this.request<T>(tenantId, 'POST', endpoint, { data });
    }

    /**
     * Execute PUT request
     */
    async put<T>(
        tenantId: string,
        endpoint: string,
        data?: any,
    ): Promise<T> {
        return this.request<T>(tenantId, 'PUT', endpoint, { data });
    }

    /**
     * Execute DELETE request
     */
    async delete<T>(
        tenantId: string,
        endpoint: string,
    ): Promise<T> {
        return this.request<T>(tenantId, 'DELETE', endpoint);
    }

    /**
     * Execute HTTP request with authentication and retry logic
     */
    private async request<T>(
        tenantId: string,
        method: string,
        endpoint: string,
        options: Partial<AxiosRequestConfig> = {},
    ): Promise<T> {
        // Get access token
        const token = await this.authService.getAccessToken(tenantId);

        // Build request config
        // ⚠️ timeout placé APRÈS le spread pour qu'aucun appelant ne puisse l'écraser
        const HARD_TIMEOUT_MS = Number(process.env.WEEZEVENT_HTTP_TIMEOUT_MS || 15000);
        const config: AxiosRequestConfig = {
            method,
            url: `${this.baseUrl}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            ...options,
            // Plafond ferme: aucun appel ne peut hanger plus de 15s
            timeout: Math.min(options.timeout ?? HARD_TIMEOUT_MS, HARD_TIMEOUT_MS),
        };

        return this.executeWithRetry<T>(config, tenantId);
    }

    /**
     * Execute request with exponential backoff retry
     */
    private async executeWithRetry<T>(
        config: AxiosRequestConfig,
        tenantId: string,
        attempt = 1,
    ): Promise<T> {
        try {
            this.logger.debug(
                `[Attempt ${attempt}/${this.maxRetries}] ${config.method} ${config.url}`,
            );

            // ⚡ Passe par le circuit breaker pour fail-fast quand l'API est down
            const response = await this.breaker.fire(config);

            this.logger.debug(
                `Request successful: ${config.method} ${config.url}`,
            );

            return response.data as T;
        } catch (error) {
            // Circuit ouvert => fail fast, pas de retry
            if (error?.code === 'EOPENBREAKER' || /breaker/i.test(error?.message || '')) {
                throw new WeezeventApiException(
                    'Weezevent API temporairement indisponible (circuit breaker ouvert)',
                    error,
                );
            }

            const shouldRetry = this.shouldRetry(error, attempt);

            if (shouldRetry) {
                const delay = this.calculateRetryDelay(attempt);

                this.logger.warn(
                    `Request failed, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
                );

                await this.sleep(delay);
                return this.executeWithRetry<T>(config, tenantId, attempt + 1);
            }

            // No more retries, throw mapped error
            throw this.mapError(error, tenantId);
        }
    }

    /**
     * Determine if request should be retried
     */
    private shouldRetry(error: any, attempt: number): boolean {
        // Don't retry if max attempts reached
        if (attempt >= this.maxRetries) {
            return false;
        }

        // Retry on network errors
        if (!error.response) {
            return true;
        }

        const status = error.response.status;

        // Retry on 5xx server errors or 429 rate limit
        return status >= 500 || status === 429;
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private calculateRetryDelay(attempt: number): number {
        return this.retryDelay * Math.pow(2, attempt - 1);
    }

    /**
     * Map HTTP errors to custom exceptions
     */
    private mapError(error: any, tenantId: string): Error {
        if (!error.response) {
            this.logger.error('Network error occurred', error.stack);
            return new WeezeventApiException(
                'Network error: Unable to reach Weezevent API',
                error,
            );
        }

        const { status, data } = error.response;
        const errorMessage = data?.message || data?.error || 'Unknown error';

        this.logger.error(
            `API error (${status}): ${errorMessage}`,
            error.stack,
        );

        switch (status) {
            case 401:
                // Clear cached token on auth failure
                this.authService.clearToken(tenantId);
                return new WeezeventAuthException(
                    `Authentication failed: ${errorMessage}`,
                );

            case 403:
                return new WeezeventApiException(
                    `Access forbidden: ${errorMessage}`,
                    error,
                );

            case 404:
                return new WeezeventApiException(
                    `Resource not found: ${errorMessage}`,
                    error,
                );

            case 429:
                return new WeezeventApiException(
                    `Rate limit exceeded: ${errorMessage}`,
                    error,
                );

            case 422:
                return new WeezeventApiException(
                    `Validation error: ${errorMessage}`,
                    error,
                );

            default:
                return new WeezeventApiException(
                    `API request failed (${status}): ${errorMessage}`,
                    error,
                );
        }
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
