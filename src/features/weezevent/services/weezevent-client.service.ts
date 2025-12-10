import { Injectable, Logger } from '@nestjs/common';
import { WeezeventApiService } from './weezevent-api.service';
import {
    WeezeventPaginatedResponse,
} from '../interfaces/weezevent.interface';
import {
    WeezeventTransaction,
    WeezeventWallet,
    WeezeventUser,
    WeezeventEvent,
    WeezeventProduct,
} from '../interfaces/weezevent-entities.interface';

export interface GetTransactionsOptions {
    page?: number;
    perPage?: number;
    status?: 'W' | 'V' | 'C' | 'R';
    fromDate?: Date;
    toDate?: Date;
    eventId?: number;
}

@Injectable()
export class WeezeventClientService {
    private readonly logger = new Logger(WeezeventClientService.name);

    constructor(private readonly apiService: WeezeventApiService) { }

    // ==================== TRANSACTIONS ====================

    /**
     * Get paginated list of transactions
     */
    async getTransactions(
        tenantId: string,
        organizationId: string,
        options?: GetTransactionsOptions,
    ): Promise<WeezeventPaginatedResponse<WeezeventTransaction>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        if (options?.status) {
            params.status = options.status;
        }

        if (options?.fromDate) {
            params.from_date = options.fromDate.toISOString();
        }

        if (options?.toDate) {
            params.to_date = options.toDate.toISOString();
        }

        if (options?.eventId) {
            params.event_id = options.eventId;
        }

        this.logger.debug(
            `Fetching transactions for organization ${organizationId} with params:`,
            params,
        );

        return this.apiService.get<WeezeventPaginatedResponse<WeezeventTransaction>>(
            tenantId,
            `/organizations/${organizationId}/transactions`,
            params,
        );
    }

    /**
     * Get a single transaction by ID
     */
    async getTransaction(
        tenantId: string,
        organizationId: string,
        transactionId: string,
    ): Promise<WeezeventTransaction> {
        this.logger.debug(
            `Fetching transaction ${transactionId} for organization ${organizationId}`,
        );

        return this.apiService.get<WeezeventTransaction>(
            tenantId,
            `/organizations/${organizationId}/transactions/${transactionId}`,
        );
    }

    // ==================== WALLETS ====================

    /**
     * Get wallet information
     */
    async getWallet(
        tenantId: string,
        organizationId: string,
        walletId: string,
    ): Promise<WeezeventWallet> {
        this.logger.debug(
            `Fetching wallet ${walletId} for organization ${organizationId}`,
        );

        return this.apiService.get<WeezeventWallet>(
            tenantId,
            `/organizations/${organizationId}/wallets/${walletId}`,
        );
    }

    /**
     * Get paginated list of wallets
     */
    async getWallets(
        tenantId: string,
        organizationId: string,
        options?: {
            page?: number;
            perPage?: number;
            status?: string;
            userId?: number;
        },
    ): Promise<WeezeventPaginatedResponse<WeezeventWallet>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        if (options?.status) {
            params.status = options.status;
        }

        if (options?.userId) {
            params.user_id = options.userId;
        }

        return this.apiService.get<WeezeventPaginatedResponse<WeezeventWallet>>(
            tenantId,
            `/organizations/${organizationId}/wallets`,
            params,
        );
    }

    // ==================== USERS ====================

    /**
     * Get user (client) information
     */
    async getUser(
        tenantId: string,
        organizationId: string,
        userId: string,
    ): Promise<WeezeventUser> {
        this.logger.debug(
            `Fetching user ${userId} for organization ${organizationId}`,
        );

        return this.apiService.get<WeezeventUser>(
            tenantId,
            `/organizations/${organizationId}/users/${userId}`,
        );
    }

    // ==================== EVENTS ====================

    /**
     * Get event information
     */
    async getEvent(
        tenantId: string,
        organizationId: string,
        eventId: string,
    ): Promise<WeezeventEvent> {
        this.logger.debug(
            `Fetching event ${eventId} for organization ${organizationId}`,
        );

        return this.apiService.get<WeezeventEvent>(
            tenantId,
            `/organizations/${organizationId}/events/${eventId}`,
        );
    }

    /**
     * Get paginated list of events
     */
    async getEvents(
        tenantId: string,
        organizationId: string,
        options?: {
            page?: number;
            perPage?: number;
        },
    ): Promise<WeezeventPaginatedResponse<WeezeventEvent>> {
        const params = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        const response = await this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/events`,
            params,
        );

        // Weezevent API returns an array directly, not a paginated response
        // Normalize it to match our expected format
        if (Array.isArray(response)) {
            return {
                data: response,
                meta: {
                    current_page: options?.page || 1,
                    per_page: options?.perPage || 50,
                    total: response.length,
                    total_pages: 1,
                },
            };
        }

        // If it's already in the correct format, return as is
        return response;
    }

    // ==================== PRODUCTS ====================

    /**
     * Get product information
     */
    async getProduct(
        tenantId: string,
        organizationId: string,
        productId: string,
    ): Promise<WeezeventProduct> {
        this.logger.debug(
            `Fetching product ${productId} for organization ${organizationId}`,
        );

        return this.apiService.get<WeezeventProduct>(
            tenantId,
            `/organizations/${organizationId}/products/${productId}`,
        );
    }

    /**
     * Get paginated list of products
     */
    async getProducts(
        tenantId: string,
        organizationId: string,
        options?: {
            page?: number;
            perPage?: number;
            category?: string;
        },
    ): Promise<WeezeventPaginatedResponse<WeezeventProduct>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        if (options?.category) {
            params.category = options.category;
        }

        const response = await this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/products`,
            params,
        );

        // Weezevent API returns an array directly, not a paginated response
        // Normalize it to match our expected format
        if (Array.isArray(response)) {
            return {
                data: response,
                meta: {
                    current_page: options?.page || 1,
                    per_page: options?.perPage || 50,
                    total: response.length,
                    total_pages: 1,
                },
            };
        }

        // If it's already in the correct format, return as is
        return response;
    }
}
