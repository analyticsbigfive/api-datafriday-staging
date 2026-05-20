export interface WeezeventTransaction {
    id: number;
    application_id: number;
    event_id: number;
    event_name: string;
    fundation_id: number;
    fundation_name: string;
    location_id: number;
    location_name: string;
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
    created_at?: string;
    updated_at?: string; // For incremental sync
    metadata?: Record<string, any>;
}

export type WeezeventProductNature = 'CUP' | 'DRINK' | 'FOOD' | 'MERCH' | 'OTHER';
export type WeezeventProductSubnature =
    | 'BEEF' | 'BEER_PREMIUM' | 'BEER_REGULAR' | 'CHICKEN' | 'CIDER_WINE'
    | 'CUP' | 'FISH' | 'HARD' | 'MERCH' | 'OTHER' | 'PORK' | 'SOFT'
    | 'VEGAN' | 'VEGETARIAN' | 'WATER';
export type WeezeventProductType =
    | 'STANDARD' | 'VARIANT' | 'VARIANT_BASE' | 'MENU' | 'PACK'
    | 'PACK_ADVANCED' | 'DONATION' | 'FEE' | 'REFUNDABLE'
    | 'REFUNDABLE_LEGACY_ZONE' | 'REFUNDABLE_RETURN'
    | 'REFUNDABLE_RETURN_LEGACY_ZONE' | 'STOCK' | 'STOCK_VESSEL' | 'TIP';

export interface WeezeventProduct {
    id: number;
    name: string;
    description?: string | null;
    /** Weezevent internal category entity ID */
    category_id?: number | null;
    /** High-level product nature used for DataFriday category mapping */
    nature?: WeezeventProductNature | null;
    /** Subcategory within a nature (e.g. BEER_PREMIUM within DRINK) */
    subnature?: WeezeventProductSubnature | null;
    type?: WeezeventProductType | null;
    /** ID of the VARIANT_BASE product this variant belongs to */
    variant_of_id?: number | null;
    merchant_id?: number | null;
    base_price: number;
    vat_rate: number;
    image?: string | null;
    /** Publicly displayed name (may differ from name) */
    online_name?: string | null;
    online_description?: string | null;
    online_image_path?: string | null;
    allergens?: string[];
    tag_ids?: number[];
    used_in_event_ids?: number[];
    is_counted_in_stock?: boolean;
    is_using_variable_price?: boolean;
    stock_value?: number | null;
    stock_measure_unit?: string | null;
    preparation_time?: number | null;
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
