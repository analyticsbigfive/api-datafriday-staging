;
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SpacesService } from '../spaces/spaces.service';
import { MenuItemPricingService } from '../../shared/pricing/menu-item-pricing.service';
import {
  CreateLocationSpaceMappingDto,
  CreateMerchantElementMappingDto,
  CreateLocationShopMappingDto,
  BulkMerchantElementMappingDto,
  BulkLocationShopMappingDto,
  BulkProductMappingDto,
} from './dto/mapping.dto';

@Injectable()
export class MappingsService {
  private readonly logger = new Logger(MappingsService.name);

  /** Safe chunk size for Prisma $transaction batches (avoids timeouts/OOM at 100k+ items). */
  private readonly BULK_CHUNK_SIZE = 500;

  constructor(
    private prisma: PrismaService,
    private spacesService: SpacesService,
    private pricing: MenuItemPricingService,
  ) {}

  // ─── Location → Space ───────────────────────────────────

  async getLocationSpaceMappings(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching location-space mappings for tenant ${tenantId} (page=${page}, limit=${limit})`);
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const skip = (Math.max(page, 1) - 1) * safeLimit;
    const [data, total] = await Promise.all([
      this.prisma.weezeventLocationSpaceMapping.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.weezeventLocationSpaceMapping.count({ where: { tenantId } }),
    ]);

    // Enrich with space name via batch fetch
    const spaceIds = [...new Set(data.map((m) => m.spaceId))];
    const spaces = spaceIds.length > 0
      ? await this.prisma.space.findMany({
          where: { id: { in: spaceIds } },
          select: { id: true, name: true },
        })
      : [];
    const spaceNameById = new Map(spaces.map((s) => [s.id, s.name]));
    const enriched = data.map((m) => ({
      ...m,
      spaceName: spaceNameById.get(m.spaceId) ?? null,
    }));

    return {
      data: enriched,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async getLocationSpaceMapping(tenantId: string, weezeventLocationId: string) {
    return this.prisma.weezeventLocationSpaceMapping.findUnique({
      where: {
        tenantId_weezeventLocationId: { tenantId, weezeventLocationId },
      },
    });
  }

  async createLocationSpaceMapping(dto: CreateLocationSpaceMappingDto, tenantId: string) {
    this.logger.log(`Mapping location ${dto.weezeventLocationId} → space ${dto.spaceId}`);

    // Verify space exists
    const space = await this.prisma.space.findFirst({
      where: { id: dto.spaceId, tenantId },
    });
    if (!space) {
      throw new NotFoundException(`Space ${dto.spaceId} not found`);
    }

    const mapping = await this.prisma.weezeventLocationSpaceMapping.upsert({
      where: {
        tenantId_weezeventLocationId: {
          tenantId,
          weezeventLocationId: dto.weezeventLocationId,
        },
      },
      create: {
        tenantId,
        weezeventLocationId: dto.weezeventLocationId,
        spaceId: dto.spaceId,
      },
      update: {
        spaceId: dto.spaceId,
      },
    });

    // G7: stamp configurationId on all WeezeventEvents linked to this location.
    // Find the latest Config for the space and use it as reference.
    const latestConfig = await this.prisma.config.findFirst({
      where: { spaceId: dto.spaceId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (latestConfig) {
      const location = await this.prisma.weezeventLocation.findFirst({
        where: { id: dto.weezeventLocationId, tenantId },
        select: { integrationId: true },
      });
      if (location?.integrationId) {
        await this.prisma.weezeventEvent.updateMany({
          where: { tenantId, integrationId: location.integrationId },
          data: { configurationId: latestConfig.id },
        });
        this.logger.log(
          `G7: stamped configurationId=${latestConfig.id} on WeezeventEvents for integration=${location.integrationId}`,
        );
      }
    }

    return mapping;
  }

  async deleteLocationSpaceMapping(tenantId: string, weezeventLocationId: string) {
    this.logger.log(`Deleting location-space mapping for location ${weezeventLocationId}`);
    return this.prisma.weezeventLocationSpaceMapping.deleteMany({
      where: { tenantId, weezeventLocationId },
    });
  }

  // ─── Location → SpaceElement ────────────────────────────

  async getLocationShopMappings(
    tenantId: string,
    weezeventLocationId?: string,
    spaceId?: string,
    page = 1,
    limit = 1000,
  ) {
    this.logger.log(
      `Fetching location-shop mappings for tenant ${tenantId} (location=${weezeventLocationId ?? 'all'}, space=${spaceId ?? 'all'})`,
    );

    const where: any = { tenantId };
    if (weezeventLocationId) where.weezeventLocationId = weezeventLocationId;

    if (spaceId) {
      // Use spaceId directly to avoid a deep 4-level JOIN chain (forecourt → config → space → tenantId).
      // tenantId scoping is enforced on the mapping itself via `where.tenantId = tenantId` above.
      const elements = await this.prisma.spaceElement.findMany({
        where: {
          OR: [
            { floor: { config: { spaceId } } },
            { forecourt: { config: { spaceId } } },
          ],
        },
        select: { id: true },
      });
      where.spaceElementId = { in: elements.map((element) => element.id) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.weezeventLocationShopMapping.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.weezeventLocationShopMapping.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async createLocationShopMapping(dto: CreateLocationShopMappingDto, tenantId: string) {
    this.logger.log(`Mapping Weezevent location ${dto.weezeventLocationId} → shop ${dto.spaceElementId}`);

    const element = await this.prisma.spaceElement.findFirst({
      where: {
        id: dto.spaceElementId,
        OR: [
          { floor: { config: { space: { tenantId } } } },
          { forecourt: { config: { space: { tenantId } } } },
        ],
      },
      select: { id: true },
    });

    if (!element) {
      throw new NotFoundException(`SpaceElement ${dto.spaceElementId} not found`);
    }

    return this.prisma.weezeventLocationShopMapping.upsert({
      where: {
        tenantId_weezeventLocationId: {
          tenantId,
          weezeventLocationId: dto.weezeventLocationId,
        },
      },
      create: {
        tenantId,
        weezeventLocationId: dto.weezeventLocationId,
        spaceElementId: dto.spaceElementId,
      },
      update: {
        spaceElementId: dto.spaceElementId,
      },
    });
  }

  async bulkLocationShopMappings(dto: BulkLocationShopMappingDto, tenantId: string) {
    const total = dto.mappings.length;
    this.logger.log(`Bulk mapping ${total} location-shop pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventLocationId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = dto.mappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        const results = await this.prisma.$transaction(
          chunk.map((m) =>
            this.prisma.weezeventLocationShopMapping.upsert({
              where: {
                tenantId_weezeventLocationId: {
                  tenantId,
                  weezeventLocationId: m.weezeventLocationId,
                },
              },
              create: {
                tenantId,
                weezeventLocationId: m.weezeventLocationId,
                spaceElementId: m.spaceElementId,
              },
              update: {
                spaceElementId: m.spaceElementId,
              },
            }),
          ),
        );
        successes.push(...results);
      } catch (err) {
        this.logger.warn(`Location-shop chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of chunk) {
          try {
            const result = await this.createLocationShopMapping(m, tenantId);
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventLocationId: m.weezeventLocationId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
      }
    }

    return {
      count: successes.length,
      total,
      failed: errors.length,
      errors,
      mappings: successes,
    };
  }

  async deleteLocationShopMapping(tenantId: string, weezeventLocationId: string) {
    const mapping = await this.prisma.weezeventLocationShopMapping.findUnique({
      where: { tenantId_weezeventLocationId: { tenantId, weezeventLocationId } },
      select: { spaceElementId: true },
    });

    const result = await this.prisma.weezeventLocationShopMapping.deleteMany({
      where: { tenantId, weezeventLocationId },
    });

    // If no other mapping references the space element, remove it from the
    // 3D builder too (Data Integration deletion ⇒ delete the 3D element).
    if (mapping?.spaceElementId) {
      try {
        await this.spacesService.deleteElementIfUnreferenced(mapping.spaceElementId, tenantId);
      } catch (err) {
        this.logger.warn(`Failed to cascade-delete SpaceElement ${mapping.spaceElementId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  // ─── Merchant → SpaceElement ─────────────────────────────

  async getMerchantElementMappings(
    tenantId: string,
    weezeventLocationId?: string,
    page = 1,
    limit = 200,
  ) {
    this.logger.log(`Fetching merchant-element mappings for tenant ${tenantId} (location=${weezeventLocationId ?? 'all'})`);

    const where: any = { tenantId };

    // If locationId provided, filter by merchants seen in transactions at this location
    if (weezeventLocationId) {
      const merchantTxs = await this.prisma.weezeventTransaction.findMany({
        where: { tenantId, locationId: weezeventLocationId, merchantId: { not: null } },
        select: { merchantId: true },
        distinct: ['merchantId'],
      });
      where.weezeventLocationId = { in: merchantTxs.map((m) => m.merchantId).filter(Boolean) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.weezeventLocationShopMapping.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.weezeventLocationShopMapping.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async createMerchantElementMapping(dto: CreateMerchantElementMappingDto, tenantId: string) {
    this.logger.log(`Mapping merchant ${dto.weezeventMerchantId} → element ${dto.spaceElementId}`);

    return this.prisma.weezeventLocationShopMapping.upsert({
      where: {
        tenantId_weezeventLocationId: {
          tenantId,
          weezeventLocationId: dto.weezeventMerchantId,
        },
      },
      create: {
        tenantId,
        weezeventLocationId: dto.weezeventMerchantId,
        spaceElementId: dto.spaceElementId,
      },
      update: {
        spaceElementId: dto.spaceElementId,
      },
    });
  }

  async bulkMerchantElementMappings(dto: BulkMerchantElementMappingDto, tenantId: string) {
    const total = dto.mappings.length;
    this.logger.log(`Bulk mapping ${total} merchant-element pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventMerchantId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = dto.mappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        const results = await this.prisma.$transaction(
          chunk.map((m) =>
            this.prisma.weezeventLocationShopMapping.upsert({
              where: {
                tenantId_weezeventLocationId: {
                  tenantId,
                  weezeventLocationId: m.weezeventMerchantId,
                },
              },
              create: {
                tenantId,
                weezeventLocationId: m.weezeventMerchantId,
                spaceElementId: m.spaceElementId,
              },
              update: {
                spaceElementId: m.spaceElementId,
              },
            }),
          ),
        );
        successes.push(...results);
      } catch (err) {
        // Chunk-level failure: fallback to per-item upsert so a single bad row doesn't lose the whole chunk
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of chunk) {
          try {
            const result = await this.prisma.weezeventLocationShopMapping.upsert({
              where: {
                tenantId_weezeventLocationId: { tenantId, weezeventLocationId: m.weezeventMerchantId },
              },
              create: { tenantId, weezeventLocationId: m.weezeventMerchantId, spaceElementId: m.spaceElementId },
              update: { spaceElementId: m.spaceElementId },
            });
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventMerchantId: m.weezeventMerchantId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
      }
    }

    return {
      count: successes.length,
      total,
      failed: errors.length,
      errors,
      mappings: successes,
    };
  }

  async deleteMerchantElementMapping(tenantId: string, weezeventMerchantId: string) {
    const mappings = await this.prisma.weezeventLocationShopMapping.findMany({
      where: { tenantId, weezeventLocationId: weezeventMerchantId },
      select: { spaceElementId: true },
    });

    const result = await this.prisma.weezeventLocationShopMapping.deleteMany({
      where: { tenantId, weezeventLocationId: weezeventMerchantId },
    });

    for (const { spaceElementId } of mappings) {
      try {
        await this.spacesService.deleteElementIfUnreferenced(spaceElementId, tenantId);
      } catch (err) {
        this.logger.warn(`Failed to cascade-delete SpaceElement ${spaceElementId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  // ─── Product → MenuItem ──────────────────────────────────

  async getProductMappingStats(tenantId: string, integrationId?: string) {
    const productWhere: any = {
      tenantId,
      OR: [
        { productType: null },
        { productType: { not: 'VARIANT' } },
      ],
    };

    if (integrationId) {
      productWhere.integrationId = integrationId;
    }

    const [total, mapped] = await Promise.all([
      this.prisma.weezeventProduct.count({ where: productWhere }),
      this.prisma.weezeventProductMapping.count({
        where: {
          tenantId,
          weezeventProduct: productWhere,
        },
      }),
    ]);

    return {
      total,
      mapped,
      unmapped: Math.max(total - mapped, 0),
    };
  }

  async getProductMappings(
    tenantId: string,
    weezeventLocationId?: string,
    page = 1,
    limit = 200,
  ) {
    this.logger.log(`Fetching product mappings for tenant ${tenantId} (location=${weezeventLocationId ?? 'all'})`);

    const where: any = { tenantId };

    if (weezeventLocationId) {
      // Filter by products sold at this location via transaction items
      const productIds = await this.prisma.$queryRaw<{ productId: string }[]>`
        SELECT DISTINCT ti."productId"
        FROM "WeezeventTransactionItem" ti
        JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
        WHERE t."tenantId" = ${tenantId}
          AND t."locationId" = ${weezeventLocationId}
          AND ti."productId" IS NOT NULL
      `;
      where.weezeventProductId = { in: productIds.map((p) => p.productId) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.weezeventProductMapping.findMany({
        where,
        include: {
          weezeventProduct: { include: { prices: true } },
          menuItem: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.weezeventProductMapping.count({ where }),
    ]);

    // Étape 3 Data Integration : on expose TOUT (le front décide quoi afficher) —
    // menuItem.pricing (catalogue) + weezeventProduct.pricing (référence Weezevent,
    // TVA + devise réelles) + weezeventProduct.salesPricing (réellement encaissé).
    const enriched = await this.pricing.enrichMappingsPricing(data, tenantId);

    return {
      data: enriched,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async bulkProductMappings(dto: BulkProductMappingDto, tenantId: string, userId: string) {
    const uniqueMappings = Array.from(
      new Map(dto.mappings.map((m) => [m.weezeventProductId, m])).values(),
    );
    const total = uniqueMappings.length;
    this.logger.log(`Bulk mapping ${total} product-menu item pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventProductId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = uniqueMappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        const now = new Date();
        const values = Prisma.join(
          chunk.map((m) => Prisma.sql`(
            ${randomUUID()},
            ${tenantId},
            ${m.weezeventProductId},
            ${m.menuItemId},
            ${m.autoMapped || false},
            ${m.confidence || null},
            ${userId},
            ${now},
            ${now}
          )`),
        );

        await this.prisma.$executeRaw`
          INSERT INTO "public"."WeezeventProductMapping"
            ("id", "tenantId", "weezeventProductId", "menuItemId", "autoMapped", "confidence", "mappedBy", "createdAt", "updatedAt")
          VALUES ${values}
          ON CONFLICT ("weezeventProductId") DO UPDATE SET
            "menuItemId" = EXCLUDED."menuItemId",
            "autoMapped" = EXCLUDED."autoMapped",
            "confidence" = EXCLUDED."confidence",
            "mappedBy" = EXCLUDED."mappedBy",
            "updatedAt" = EXCLUDED."updatedAt"
        `;

        successes.push(
          ...chunk.map((m) => ({
            tenantId,
            weezeventProductId: m.weezeventProductId,
            menuItemId: m.menuItemId,
            autoMapped: m.autoMapped || false,
            confidence: m.confidence || null,
            mappedBy: userId,
          })),
        );
      } catch (err) {
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err instanceof Error ? err.message : String(err)}`);
        for (const m of chunk) {
          try {
            const result = await this.prisma.weezeventProductMapping.upsert({
              where: { weezeventProductId: m.weezeventProductId },
              create: {
                tenantId,
                weezeventProductId: m.weezeventProductId,
                menuItemId: m.menuItemId,
                autoMapped: m.autoMapped || false,
                confidence: m.confidence || null,
                mappedBy: userId,
              },
              update: {
                menuItemId: m.menuItemId,
                autoMapped: m.autoMapped || false,
                confidence: m.confidence || null,
                mappedBy: userId,
              },
            });
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventProductId: m.weezeventProductId, error: itemErr instanceof Error ? itemErr.message : String(itemErr) });
          }
        }
      }
    }

    return {
      count: successes.length,
      total,
      failed: errors.length,
      errors,
      mappings: successes,
    };
  }

  async deleteProductMapping(tenantId: string, weezeventProductId: string) {
    return this.prisma.weezeventProductMapping.deleteMany({
      where: { tenantId, weezeventProductId },
    });
  }

  // ─── Integration Progress ────────────────────────────────

  async getIntegrationProgress(tenantId: string, weezeventLocationId: string) {
    // Step 1: Location→Space mapping exists?
    const locationMapping = await this.prisma.weezeventLocationSpaceMapping.findUnique({
      where: {
        tenantId_weezeventLocationId: { tenantId, weezeventLocationId },
      },
    });

    const step1 = !!locationMapping;
    let step2 = false;
    let step3 = false;
    let step4 = false;
    let step5 = false;

    if (locationMapping) {
      // Step 2: Merchant→Element mappings exist?
      const merchantTxs = await this.prisma.weezeventTransaction.findMany({
        where: { tenantId, locationId: weezeventLocationId, merchantId: { not: null } },
        select: { merchantId: true },
        distinct: ['merchantId'],
      });
      const merchantIds = merchantTxs.map((m) => m.merchantId).filter(Boolean);
      if (merchantIds.length > 0) {
        const merchantMappings = await this.prisma.weezeventLocationShopMapping.count({
          where: {
            tenantId,
            weezeventLocationId: { in: merchantIds },
          },
        });
        step2 = merchantMappings > 0;
      }

      // Step 3: Product→MenuItem mappings exist?
      const productMappings = await this.prisma.weezeventProductMapping.count({
        where: { tenantId },
      });
      step3 = productMappings > 0;

      // Step 4: All past events have been aggregated?
      const [completedJobs, pastEventCount] = await Promise.all([
        this.prisma.aggregationJobLog.count({
          where: { tenantId, spaceId: locationMapping.spaceId, status: 'completed' },
        }),
        this.prisma.event.count({
          where: { tenantId, spaceId: locationMapping.spaceId, eventDate: { lte: new Date() } },
        }),
      ]);
      step4 = pastEventCount > 0 && completedJobs >= pastEventCount;

      // Step 5: Space revenue aggregations exist?
      const aggregations = await this.prisma.spaceRevenueMinuteAgg.count({
        where: {
          tenantId,
          spaceId: locationMapping.spaceId,
        },
      });
      step5 = aggregations > 0;
    }

    return {
      weezeventLocationId,
      spaceId: locationMapping?.spaceId || null,
      steps: {
        step1_space_mapped: step1,
        step2_shops_mapped: step2,
        step3_menu_mapped: step3,
        step4_events_processed: step4,
        step5_synchronized: step5,
      },
      completedSteps: [step1, step2, step3, step4, step5].filter(Boolean).length,
      totalSteps: 5,
    };
  }

  /**
   * Retourne la progression d'intégration pour toutes les intégrations Weezevent du tenant.
   * Optimisé : précharge les compteurs en parallèle pour éviter N×5 queries.
   * Utilisé par l'écran "LocationListItem" du wizard.
   *
   * Clé de conception :
   *  - L'entité primaire du wizard est WeezeventIntegration (= un compte Weezevent / "location" dans l'UI).
   *  - WeezeventLocationSpaceMapping.weezeventLocationId stocke l'integrationId (convention step1).
   *  - WeezeventLocationShopMapping.weezeventLocationId stocke WeezeventLocation.id (cuid, convention step2).
   *  - WeezeventTransaction.locationId est une FK vers WeezeventLocation.id (cuid).
   */
  async getAllIntegrationProgress(tenantId: string) {
    this.logger.log(`Fetching integration progress for all integrations of tenant ${tenantId}`);

    // 1. Toutes les intégrations Weezevent du tenant (= "locations" dans le wizard)
    const integrations = await this.prisma.weezeventIntegration.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    if (integrations.length === 0) {
      return { data: [], meta: { total: 0 } };
    }

    const integrationIds = integrations.map((i) => i.id);

    // Résoudre les WeezeventLocation.id (cuids) par integrationId
    // Nécessaire pour step2 : WeezeventLocationShopMapping.weezeventLocationId = WeezeventLocation.id
    const locationsByIntegration = await this.prisma.weezeventLocation.findMany({
      where: { tenantId, integrationId: { in: integrationIds } },
      select: { id: true, integrationId: true },
    });

    const locationIdsByIntegration = new Map<string, string[]>();
    for (const loc of locationsByIntegration) {
      const list = locationIdsByIntegration.get(loc.integrationId) ?? [];
      list.push(loc.id);
      locationIdsByIntegration.set(loc.integrationId, list);
    }
    const allLocationCuids = locationsByIntegration.map((l) => l.id);

    // 2. Précharge en parallèle (évite N×5 queries série)
    const [
      locationMappings,     // step1 : integrationId → spaceId
      shopMappings,         // step2 : WeezeventLocation.id (cuid) → SpaceElement
      productMappingsCount, // step3
      aggJobs,              // step4 — completed jobs per spaceId
      revenueAggs,          // step5
      pastEvents,           // step4 — past events per spaceId
    ] = await Promise.all([
      // step1 : WeezeventLocationSpaceMapping.weezeventLocationId = integrationId (convention step1)
      this.prisma.weezeventLocationSpaceMapping.findMany({
        where: { tenantId, weezeventLocationId: { in: integrationIds } },
        select: { weezeventLocationId: true, spaceId: true },
      }),
      // step2 : WeezeventLocationShopMapping.weezeventLocationId = WeezeventLocation.id (cuid)
      allLocationCuids.length > 0
        ? this.prisma.weezeventLocationShopMapping.findMany({
            where: { tenantId, weezeventLocationId: { in: allLocationCuids } },
            select: { weezeventLocationId: true },
          })
        : Promise.resolve([]),
      this.prisma.weezeventProductMapping.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.groupBy({
        by: ['spaceId'],
        where: { tenantId, status: 'completed' },
        _count: true,
      }),
      this.prisma.event.groupBy({
        by: ['spaceId'],
        where: { tenantId, eventDate: { lte: new Date() } },
        _count: true,
      }),
      this.prisma.spaceRevenueMinuteAgg.groupBy({
        by: ['spaceId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    // Index en Maps pour lookups O(1)
    const integSpaceMap = new Map(locationMappings.map((m) => [m.weezeventLocationId, m.spaceId]));
    const mappedLocationCuidSet = new Set(shopMappings.map((m) => m.weezeventLocationId));
    const aggJobCountBySpace = new Map(aggJobs.filter((j) => j.spaceId).map((j) => [j.spaceId as string, j._count]));
    const pastEventCountBySpace = new Map(pastEvents.filter((e) => e.spaceId).map((e) => [e.spaceId as string, e._count]));
    const revenueBySpace = new Set(revenueAggs.map((r) => r.spaceId).filter(Boolean));

    // 3. Calcul par intégration
    const data = integrations.map((integ) => {
      // step1 : l'intégration est-elle liée à un espace ?
      const spaceId = integSpaceMap.get(integ.id) ?? null;
      const step1 = !!spaceId;

      // step2 : au moins un point de vente (WeezeventLocation) mappé à un SpaceElement ?
      const locationCuids = locationIdsByIntegration.get(integ.id) ?? [];
      const step2 = locationCuids.some((lid) => mappedLocationCuidSet.has(lid));

      // step3 : global au tenant (pas par intégration)
      const step3 = productMappingsCount > 0;

      const pastEvtCount = (spaceId && pastEventCountBySpace.get(spaceId)) || 0;
      const completedJobCount = (spaceId && aggJobCountBySpace.get(spaceId)) || 0;
      const step4 = pastEvtCount > 0 && completedJobCount >= pastEvtCount;
      const step5 = !!spaceId && revenueBySpace.has(spaceId);

      const completedSteps = [step1, step2, step3, step4, step5].filter(Boolean).length;

      return {
        weezeventLocationId: integ.id, // compatibilité frontend : le wizard identifie les intégrations par leur id
        name: integ.name,
        spaceId,
        steps: {
          step1_space_mapped: step1,
          step2_shops_mapped: step2,
          step3_menu_mapped: step3,
          step4_events_processed: step4,
          step5_synchronized: step5,
        },
        completedSteps,
        totalSteps: 5,
      };
    });

    return {
      data,
      meta: {
        total: data.length,
        fullyConfigured: data.filter((d) => d.completedSteps === 5).length,
        partiallyConfigured: data.filter((d) => d.completedSteps > 0 && d.completedSteps < 5).length,
        notStarted: data.filter((d) => d.completedSteps === 0).length,
      },
    };
  }

  /**
   * Résumé post-sync pour une location : counts utiles à l'écran WizardSuccess.
   */
  async getLocationSummary(tenantId: string, weezeventLocationId: string) {
    const locationMapping = await this.prisma.weezeventLocationSpaceMapping.findUnique({
      where: { tenantId_weezeventLocationId: { tenantId, weezeventLocationId } },
    });
    if (!locationMapping) {
      throw new NotFoundException(`Location ${weezeventLocationId} not mapped to a space`);
    }

    const [merchantTxs, merchantMappings, productMappings, totalProducts, eventsCount] = await Promise.all([
      this.prisma.weezeventTransaction.findMany({
        where: { tenantId, locationId: weezeventLocationId, merchantId: { not: null } },
        select: { merchantId: true },
        distinct: ['merchantId'],
      }),
      this.prisma.weezeventLocationShopMapping.count({ where: { tenantId } }),
      this.prisma.weezeventProductMapping.count({ where: { tenantId } }),
      this.prisma.weezeventProduct.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.count({
        where: { tenantId, spaceId: locationMapping.spaceId, status: 'completed' },
      }),
    ]);

    return {
      weezeventLocationId,
      spaceId: locationMapping.spaceId,
      merchants: {
        total: merchantTxs.length,
        mapped: merchantMappings,
      },
      products: {
        total: totalProducts,
        mapped: productMappings,
      },
      events: {
        processed: eventsCount,
      },
    };
  }
}
