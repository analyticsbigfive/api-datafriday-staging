import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { WeezeventAuthService } from './weezevent-auth.service';
import { WeezeventApiException } from '../exceptions/weezevent-api.exception';
import { WeezeventAuthException } from '../exceptions/weezevent-auth.exception';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class WeezeventApiService {
    private readonly logger = new Logger(WeezeventApiService.name);
    private readonly baseUrl = 'https://api.weezevent.com/pay/v1';
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000; // ms

    constructor(
        private readonly httpService: HttpService,
        private readonly authService: WeezeventAuthService,
    ) { }

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
        const config: AxiosRequestConfig = {
            method,
            url: `${this.baseUrl}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            ...options,
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

            const response = await this.httpService.axiosRef.request<T>(config);

            this.logger.debug(
                `Request successful: ${config.method} ${config.url}`,
            );

            return response.data;
        } catch (error) {
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
