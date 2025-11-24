export interface WeezeventConfig {
    clientId: string;
    clientSecret: string;
    enabled: boolean;
}

export interface WeezeventTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

export interface WeezeventPaginatedResponse<T> {
    data: T[];
    meta: {
        current_page: number;
        per_page: number;
        total: number;
        total_pages: number;
    };
}
