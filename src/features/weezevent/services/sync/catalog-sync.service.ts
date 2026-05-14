import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { WeezeventClientService } from '../weezevent-client.service';
import { SyncResult } from '../weezevent-sync.service';

/**
 * WeezeventCatalogSyncService
 *
 * SRP: owns rich catalog enrichment — events and products fetched directly
 * from the Weezevent catalog API with full metadata (dates, capacity, variants,
 * components). Called by the CRON job; NOT required for the core transaction
 * sync pipeline (which extracts entities inline from transaction data).
 */
@Injectable()
export class WeezeventCatalogSyncService {
    private readonly logger = new Logger(WeezeventCatalogSyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly weezeventClient: WeezeventClientService,
    ) {}

    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    async syncEvents(tenantId: string, integrationId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'events',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, enabled: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId) {
                throw new Error(`Weezevent integration ${integrationId} not found for tenant ${tenantId}`);
            }
            if (!integration.organizationId) {
                throw new Error(`Weezevent organization ID not configured for integration ${integrationId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing events for tenant ${tenantId}, organization ${organizationId}`);

            const response = await this.weezeventClient.getEvents(tenantId, organizationId, { perPage: 100 });

            const parseDate = (dateStr: string | undefined): Date | null => {
                if (!dateStr) return null;
                const parsed = new Date(dateStr);
                return isNaN(parsed.getTime()) ? null : parsed;
            };

            const weezeventIds = response.data.map(e => e.id.toString());
            const existingEvents = await this.prisma.weezeventEvent.findMany({
                where: { tenantId, integrationId, weezeventId: { in: weezeventIds } },
                select: { weezeventId: true },
            });
            const existingIds = new Set(existingEvents.map(e => e.weezeventId));

            const eventsToCreate: any[] = [];
            const eventsToUpdate: { weezeventId: string; data: any }[] = [];

            for (const apiEvent of response.data) {
                try {
                    const weezeventId = apiEvent.id.toString();
                    const startDateStr = apiEvent.live_start || apiEvent.start_date;
                    const endDateStr = apiEvent.live_end || apiEvent.end_date;
                    const locationStr = apiEvent.location || apiEvent.venue || null;
                    const eventStatus = apiEvent.status as any;
                    const statusValue = typeof eventStatus === 'object' && eventStatus?.name
                        ? eventStatus.name
                        : (typeof eventStatus === 'string' ? eventStatus : 'unknown');

                    const eventData = {
                        name: apiEvent.name || `Event ${apiEvent.id}`,
                        organizationId,
                        startDate: parseDate(startDateStr),
                        endDate: parseDate(endDateStr),
                        description: apiEvent.description || apiEvent.name || null,
                        location: locationStr,
                        capacity: apiEvent.capacity || null,
                        status: statusValue,
                        metadata: apiEvent.metadata || null,
                        rawData: apiEvent as any,
                        syncedAt: new Date(),
                    };

                    if (existingIds.has(weezeventId)) {
                        eventsToUpdate.push({ weezeventId, data: eventData });
                    } else {
                        eventsToCreate.push({ weezeventId, tenantId, integrationId, ...eventData });
                    }
                } catch (error) {
                    this.logger.error(`Failed to prepare event ${apiEvent.id}`, (error as Error).stack);
                    result.errors++;
                }
            }

            if (eventsToCreate.length > 0) {
                await this.prisma.weezeventEvent.createMany({ data: eventsToCreate, skipDuplicates: true });
                result.itemsCreated = eventsToCreate.length;
            }

            if (eventsToUpdate.length > 0) {
                await this.prisma.$transaction(
                    eventsToUpdate.map(({ weezeventId, data }) =>
                        this.prisma.weezeventEvent.update({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                            data,
                        })
                    )
                );
                result.itemsUpdated = eventsToUpdate.length;
            }

            result.itemsSynced = eventsToCreate.length + eventsToUpdate.length;
            result.success = result.errors === 0;
            result.duration = Date.now() - startTime;

            await this.prisma.weezeventSyncState.upsert({
                where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType: 'events' } },
                create: {
                    tenantId, integrationId, syncType: 'events',
                    lastSyncedAt: new Date(), lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration, totalSynced: result.itemsSynced,
                },
                update: {
                    lastSyncedAt: new Date(), lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration, totalSynced: { increment: result.itemsSynced },
                },
            });

            return result;
        } catch (error) {
            this.logger.error('Events sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Products
    // ─────────────────────────────────────────────────────────────

    async syncProducts(tenantId: string, integrationId: string): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            type: 'products',
            success: false,
            itemsSynced: 0,
            itemsCreated: 0,
            itemsUpdated: 0,
            errors: 0,
            duration: 0,
        };

        try {
            const integration = await this.prisma.weezeventIntegration.findUnique({
                where: { id: integrationId },
                select: { id: true, organizationId: true, enabled: true, tenantId: true },
            });
            if (!integration || integration.tenantId !== tenantId) {
                throw new Error(`Weezevent integration ${integrationId} not found for tenant ${tenantId}`);
            }
            if (!integration.organizationId) {
                throw new Error(`Weezevent organization ID not configured for integration ${integrationId}`);
            }
            const organizationId = integration.organizationId;

            this.logger.log(`Syncing products for tenant ${tenantId}, organization ${organizationId}`);

            const response = await this.weezeventClient.getProducts(tenantId, organizationId, { perPage: 100 });

            const weezeventIds = response.data.map(p => p.id.toString());
            const existingProducts = await this.prisma.weezeventProduct.findMany({
                where: { tenantId, integrationId, weezeventId: { in: weezeventIds } },
                select: { weezeventId: true, rawData: true },
            });
            const existingMap = new Map(existingProducts.map(p => [p.weezeventId, p.rawData]));

            const productsToCreate: any[] = [];
            const productsToUpdate: { weezeventId: string; data: any }[] = [];
            const productIdsNeedingDetailSync: string[] = [];

            for (const apiProduct of response.data) {
                const weezeventId = apiProduct.id.toString();
                const productData = {
                    name: apiProduct.name || `Product ${apiProduct.id}`,
                    description: apiProduct.description || null,
                    category: apiProduct.category || null,
                    basePrice: apiProduct.base_price || null,
                    vatRate: apiProduct.vat_rate || null,
                    image: apiProduct.image || null,
                    allergens: apiProduct.allergens || [],
                    components: apiProduct.components || null,
                    variants: apiProduct.variants || null,
                    metadata: apiProduct.metadata || null,
                    rawData: apiProduct as any,
                    syncedAt: new Date(),
                };

                if (existingMap.has(weezeventId)) {
                    const storedRaw = existingMap.get(weezeventId) as any;
                    const hasChanged = this.productFingerprint(storedRaw) !== this.productFingerprint(apiProduct);
                    if (hasChanged) {
                        productsToUpdate.push({ weezeventId, data: productData });
                        productIdsNeedingDetailSync.push(weezeventId);
                    }
                } else {
                    productsToCreate.push({ weezeventId, tenantId, integrationId, ...productData });
                    productIdsNeedingDetailSync.push(weezeventId);
                }
            }

            if (productsToCreate.length > 0) {
                await this.prisma.weezeventProduct.createMany({ data: productsToCreate, skipDuplicates: true });
                result.itemsCreated = productsToCreate.length;
            }

            if (productsToUpdate.length > 0) {
                await this.prisma.$transaction(
                    productsToUpdate.map(({ weezeventId, data }) =>
                        this.prisma.weezeventProduct.update({
                            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId } },
                            data,
                        })
                    )
                );
                result.itemsUpdated = productsToUpdate.length;
            }

            result.itemsSynced = productsToCreate.length + productsToUpdate.length;

            const skippedDetails = response.data.length - productIdsNeedingDetailSync.length;
            this.logger.log(
                `Syncing variants/components for ${productIdsNeedingDetailSync.length}/${response.data.length} products` +
                (skippedDetails > 0 ? ` (${skippedDetails} unchanged — skipped)` : ''),
            );

            const CONCURRENCY = 5;
            for (let i = 0; i < productIdsNeedingDetailSync.length; i += CONCURRENCY) {
                const chunk = productIdsNeedingDetailSync.slice(i, i + CONCURRENCY);
                await Promise.allSettled(
                    chunk.map(productId =>
                        this.syncProductDetails(tenantId, integrationId, organizationId, productId)
                            .catch((error: Error) =>
                                this.logger.warn(`Failed to sync details for product ${productId}: ${error.message}`)
                            )
                    )
                );
            }

            result.success = true;
            result.duration = Date.now() - startTime;

            this.logger.log(
                `Products sync completed: ${result.itemsSynced} synced (${result.itemsCreated} created, ${result.itemsUpdated} updated) in ${result.duration}ms`,
            );

            await this.prisma.weezeventSyncState.upsert({
                where: { tenantId_integrationId_syncType: { tenantId, integrationId, syncType: 'products' } },
                create: {
                    tenantId, integrationId, syncType: 'products',
                    lastSyncedAt: new Date(), lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration, totalSynced: result.itemsSynced,
                },
                update: {
                    lastSyncedAt: new Date(), lastSyncCount: result.itemsSynced,
                    lastSyncDuration: result.duration, totalSynced: { increment: result.itemsSynced },
                },
            });

            return result;
        } catch (error) {
            this.logger.error('Products sync failed', (error as Error).stack);
            result.success = false;
            result.duration = Date.now() - startTime;
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────

    /**
     * Stable fingerprint for a Weezevent product API object.
     * Only compares scalar fields to avoid false-positive "changed" on JSON roundtrip.
     */
    private productFingerprint(p: any): string {
        return [
            p?.id,
            p?.name,
            p?.description ?? '',
            p?.category ?? '',
            String(p?.base_price ?? ''),
            String(p?.vat_rate ?? ''),
            p?.image ?? '',
        ].join('|');
    }

    /**
     * Sync product details: variants and components.
     * Only called for new or changed products to minimize API calls.
     */
    private async syncProductDetails(
        tenantId: string,
        integrationId: string,
        organizationId: string,
        productId: string,
    ): Promise<void> {
        const product = await this.prisma.weezeventProduct.findUnique({
            where: { tenantId_integrationId_weezeventId: { tenantId, integrationId, weezeventId: productId } },
            select: { id: true, weezeventId: true },
        });

        if (!product) {
            this.logger.warn(`Product ${productId} not found in DB, skipping details sync`);
            return;
        }

        const [variantsResult, componentsResult] = await Promise.allSettled([
            this.weezeventClient.getProductVariants(tenantId, organizationId, productId),
            this.weezeventClient.getProductComponents(tenantId, organizationId, productId),
        ]);

        if (variantsResult.status === 'fulfilled') {
            try {
                const variants = variantsResult.value;
                await this.prisma.weezeventProductVariant.deleteMany({ where: { productId: product.id } });
                if (variants.length > 0) {
                    await this.prisma.weezeventProductVariant.createMany({
                        data: variants.map((v: any) => ({
                            weezeventId: v.id?.toString() || `${productId}-variant-${v.name}`,
                            tenantId, integrationId,
                            productId: product.id,
                            name: v.name || 'Unnamed Variant',
                            description: v.description || null,
                            price: v.price || null,
                            sku: v.sku || null,
                            stock: v.stock || null,
                            isDefault: v.is_default || false,
                            metadata: v.metadata || null,
                            rawData: v,
                            syncedAt: new Date(),
                        })),
                        skipDuplicates: true,
                    });
                }
            } catch (error) {
                this.logger.warn(`Failed to sync variants for product ${productId}: ${(error as Error).message}`);
            }
        }

        if (componentsResult.status === 'fulfilled') {
            try {
                const components = componentsResult.value;
                await this.prisma.weezeventProductComponent.deleteMany({ where: { productId: product.id } });
                if (components.length > 0) {
                    await this.prisma.weezeventProductComponent.createMany({
                        data: components.map((c: any) => ({
                            weezeventId: c.id?.toString() || `${productId}-component-${c.name}`,
                            tenantId, integrationId,
                            productId: product.id,
                            name: c.name || 'Unnamed Component',
                            description: c.description || null,
                            quantity: c.quantity || null,
                            unit: c.unit || null,
                            isRequired: c.is_required !== false,
                            metadata: c.metadata || null,
                            rawData: c,
                            syncedAt: new Date(),
                        })),
                        skipDuplicates: true,
                    });
                }
            } catch (error) {
                this.logger.warn(`Failed to sync components for product ${productId}: ${(error as Error).message}`);
            }
        }
    }
}
