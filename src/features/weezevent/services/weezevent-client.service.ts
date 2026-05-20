import { Injectable, Logger } from '@nestjs/common';
import { WeezeventApiService } from './weezevent-api.service';
import {
    WeezeventPaginatedResponse,
    WeezeventCursorPage,
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
    /** Full cursor URL from the Link: rel="next" response header. When set, all other params are ignored. */
    cursor?: string;
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
            params.created_at__gte = options.fromDate.toISOString();
        }

        if (options?.toDate) {
            params.created_at__lte = options.toDate.toISOString();
        }

        if (options?.eventId) {
            params.event_id = options.eventId;
        }

        this.logger.debug(
            `Fetching transactions for organization ${organizationId} with params:`,
            params,
        );

        const response = await this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/transactions`,
            params,
        );

        // Weezevent API may return an array directly, normalize to paginated format.
        // We cannot rely on response.length >= perPage to detect more pages because the
        // Weezevent API silently caps per_page at its own limit (e.g. 100), so asking for
        // 500 and receiving 100 would incorrectly signal "last page".
        // Strategy: if we received any items, signal "there may be more" (total_pages = current + 1)
        // and let the caller stop on the first empty page.
        if (Array.isArray(response)) {
            const perPage = options?.perPage || 50;
            const currentPage = options?.page || 1;
            const hasItems = response.length > 0;
            return {
                data: response,
                meta: {
                    current_page: currentPage,
                    per_page: perPage,
                    total: response.length,
                    total_pages: hasItems ? currentPage + 1 : currentPage,
                },
            };
        }

        // If it's already in the correct format, return as is
        return response;
    }

    /**
     * Fetch one page of transactions using cursor-based pagination.
     * On first call, pass fromDate / perPage / etc. (no cursor).
     * On subsequent calls, pass only { cursor: page.nextCursor }.
     * Returns null nextCursor when the last page has been reached.
     */
    async getTransactionPage(
        tenantId: string,
        organizationId: string,
        options?: GetTransactionsOptions,
    ): Promise<WeezeventCursorPage<WeezeventTransaction>> {
        let result: { data: any; headers: Record<string, string> };

        if (options?.cursor) {
            // Follow the cursor URL provided by Weezevent's Link header
            result = await this.apiService.getFullResponse<any>(
                tenantId,
                options.cursor,
                undefined,
                true, // isFullUrl
            );
        } else {
            // First page — build params
            const params: Record<string, any> = {
                per_page: options?.perPage || 50,
            };
            if (options?.status) params.status = options.status;
            if (options?.fromDate) params.created_at__gte = options.fromDate.toISOString();
            if (options?.toDate) params.created_at__lte = options.toDate.toISOString();
            if (options?.eventId) params.event_id = options.eventId;

            result = await this.apiService.getFullResponse<any>(
                tenantId,
                `/organizations/${organizationId}/transactions`,
                params,
            );
        }

        const items: WeezeventTransaction[] = Array.isArray(result.data)
            ? result.data
            : (result.data?.data ?? []);

        const linkHeader = result.headers['link'] ?? result.headers['Link'] ?? '';
        const nextCursor = this.parseLinkHeader(linkHeader);

        this.logger.debug(
            `getTransactionPage: ${items.length} items, nextCursor=${nextCursor ? 'present' : 'none'}`,
        );

        return { items, nextCursor };
    }

    /**
     * Parse RFC 5988 Link header and return the rel="next" URL, or null.
     * Example header: `<https://api.weezevent.com/...?cursor=abc>; rel="next"`
     */
    private parseLinkHeader(linkHeader: string): string | null {
        if (!linkHeader) return null;
        // Split on commas not inside angle brackets
        const parts = linkHeader.split(/,\s*(?=<)/);
        for (const part of parts) {
            const match = part.match(/<([^>]+)>[^;]*;.*rel="next"/);
            if (match) return match[1];
        }
        return null;
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

        // Weezevent API returns an array directly (non-paginated): treat the whole
        // response as a single page so the caller's while-loop terminates immediately.
        if (Array.isArray(response)) {
            const perPage = options?.perPage || 50;
            return {
                data: response,
                meta: {
                    current_page: 1,
                    per_page: perPage,
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

        // Weezevent API returns an array directly (non-paginated): treat the whole
        // response as a single page so the caller's while-loop terminates immediately.
        if (Array.isArray(response)) {
            const perPage = options?.perPage || 50;
            return {
                data: response,
                meta: {
                    current_page: 1,
                    per_page: perPage,
                    total: response.length,
                    total_pages: 1,
                },
            };
        }

        // If it's already in the correct format, return as is
        return response;
    }

    /**
     * Get product variants
     */
    async getProductVariants(
        tenantId: string,
        organizationId: string,
        productId: string,
        eventId?: string,
    ): Promise<any[]> {
        const path = eventId
            ? `/organizations/${organizationId}/events/${eventId}/products/${productId}/variants`
            : `/organizations/${organizationId}/products/${productId}/variants`;

        this.logger.debug(`Fetching variants for product ${productId}`);

        const response = await this.apiService.get<any>(tenantId, path);
        return Array.isArray(response) ? response : response.data || [];
    }

    /**
     * Get product components (ingredients/sub-products)
     */
    async getProductComponents(
        tenantId: string,
        organizationId: string,
        productId: string,
        eventId?: string,
    ): Promise<any[]> {
        const path = eventId
            ? `/organizations/${organizationId}/events/${eventId}/products/${productId}/components`
            : `/organizations/${organizationId}/products/${productId}/components`;

        this.logger.debug(`Fetching components for product ${productId}`);

        const response = await this.apiService.get<any>(tenantId, path);
        return Array.isArray(response) ? response : response.data || [];
    }

    /**
     * Get product menu steps (customizable choices)
     */
    async getProductMenuSteps(
        tenantId: string,
        organizationId: string,
        productId: string,
        eventId?: string,
    ): Promise<any[]> {
        const path = eventId
            ? `/organizations/${organizationId}/events/${eventId}/products/${productId}/menu-steps`
            : `/organizations/${organizationId}/products/${productId}/menu-steps`;

        this.logger.debug(`Fetching menu steps for product ${productId}`);

        const response = await this.apiService.get<any>(tenantId, path);
        return Array.isArray(response) ? response : response.data || [];
    }

    // ==================== ORDERS ====================
    /**
     * Get paginated list of orders
     */
    async getOrders(
        tenantId: string,
        organizationId: string,
        eventId: string,
        options?: {
            page?: number;
            perPage?: number;
            status?: string;
            fromDate?: Date;
            toDate?: Date;
        },
    ): Promise<WeezeventPaginatedResponse<any>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        if (options?.status) params.status = options.status;
        if (options?.fromDate) params.from_date = options.fromDate.toISOString();
        if (options?.toDate) params.to_date = options.toDate.toISOString();

        this.logger.debug(`Fetching orders for event ${eventId}`);

        const response = await this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/events/${eventId}/orders`,
            params,
        );

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

        return response;
    }

    /**
     * Get a single order by ID
     */
    async getOrder(
        tenantId: string,
        organizationId: string,
        eventId: string,
        orderId: string,
    ): Promise<any> {
        this.logger.debug(`Fetching order ${orderId} for event ${eventId}`);

        return this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/events/${eventId}/orders/${orderId}`,
        );
    }

    // ==================== PRICES ====================

    /**
     * Get paginated list of prices
     */
    async getPrices(
        tenantId: string,
        organizationId: string,
        eventId?: string,
        options?: {
            page?: number;
            perPage?: number;
        },
    ): Promise<WeezeventPaginatedResponse<any>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        const path = eventId
            ? `/organizations/${organizationId}/events/${eventId}/prices`
            : `/organizations/${organizationId}/prices`;

        this.logger.debug(`Fetching prices${eventId ? ` for event ${eventId}` : ''}`);

        const response = await this.apiService.get<any>(tenantId, path, params);

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

        return response;
    }

    // ==================== ATTENDEES ====================

    /**
     * Get paginated list of attendees
     */
    async getAttendees(
        tenantId: string,
        organizationId: string,
        eventId: string,
        options?: {
            page?: number;
            perPage?: number;
            status?: string;
        },
    ): Promise<WeezeventPaginatedResponse<any>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 50,
        };

        if (options?.status) params.status = options.status;

        this.logger.debug(`Fetching attendees for event ${eventId}`);

        const response = await this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/events/${eventId}/attendees`,
            params,
        );

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

        return response;
    }

    // ==================== LOCATIONS ====================

    /**
     * Get all locations for a specific event.
     * Endpoint: GET /organizations/{org}/events/{event}/locations
     */
    async getLocations(
        tenantId: string,
        organizationId: string,
        eventId: string,
        options?: { page?: number; perPage?: number },
    ): Promise<WeezeventPaginatedResponse<any>> {
        const params: Record<string, any> = {
            page: options?.page || 1,
            per_page: options?.perPage || 100,
        };

        this.logger.debug(`Fetching locations for event ${eventId}`);

        const response = await this.apiService.get<any>(
            tenantId,
            `/organizations/${organizationId}/events/${eventId}/locations`,
            params,
        );

        if (Array.isArray(response)) {
            return {
                data: response,
                meta: {
                    current_page: options?.page || 1,
                    per_page: options?.perPage || 100,
                    total: response.length,
                    total_pages: 1,
                },
            };
        }

        return response;
    }
}
