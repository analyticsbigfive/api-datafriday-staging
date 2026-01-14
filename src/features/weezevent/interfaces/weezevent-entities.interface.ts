export interface WeezeventTransaction {
    id: number;
    application_id: number;
    event_id: number;
    event_name: string;
    fundation_id: number;
    fundation_name: string;
    location_id: number;
    location_name: string;
    seller_id: number;
    seller_wallet_id: number;
    status: 'W' | 'V' | 'C' | 'R'; // Waiting, Validated, Cancelled, Refunded
    created: string;
    updated: string;
    rows: WeezeventTransactionRow[];
}

export interface WeezeventTransactionRow {
    id: number;
    item_id: number;
    compound_id: number;
    component: boolean;
    unit_price: number;
    vat: number;
    reduction: number;
    payments: WeezeventPayment[];
}

export interface WeezeventPayment {
    id: number;
    wallet_id: number;
    balance_id: number;
    amount: number;
    amount_vat: number;
    currency_id: number;
    quantity: number;
    payment_method_id: number;
    invoice_id: number;
}

export interface WeezeventWallet {
    id: number;
    balance: number;
    currency_id: number;
    user_id: number;
    wallet_group_id: number;
    status: string;
    created_at: string;
    updated_at: string;
    metadata?: {
        card_number?: string;
        card_type?: string;
    };
}

export interface WeezeventUser {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    phone?: string;
    birthdate?: string;
    address?: {
        street?: string;
        city?: string;
        postal_code?: string;
        country?: string;
    };
    wallet_id: number;
    created_at: string;
    metadata?: {
        gdpr_consent?: boolean;
        marketing_consent?: boolean;
    };
}

export interface WeezeventEvent {
    id: number;
    name: string;
    organization_id: number;
    // API peut retourner start_date/end_date OU live_start/live_end
    start_date?: string;
    end_date?: string;
    live_start?: string;
    live_end?: string;
    description?: string;
    location?: string;
    venue?: string; // Alternative à location
    capacity?: number;
    status?: string;
    metadata?: Record<string, any>;
}

export interface WeezeventProduct {
    id: number;
    name: string;
    description?: string;
    category?: string;
    base_price: number;
    vat_rate: number;
    image?: string;
    allergens?: string[];
    components?: Array<{
        id: number;
        name: string;
        quantity: number;
    }>;
    variants?: Array<{
        id: number;
        name: string;
        price: number;
    }>;
    metadata?: Record<string, any>;
}
