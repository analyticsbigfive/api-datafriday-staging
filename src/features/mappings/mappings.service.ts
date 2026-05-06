import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  CreateLocationSpaceMappingDto,
  CreateMerchantElementMappingDto,
  BulkMerchantElementMappingDto,
  BulkProductMappingDto,
} from './dto/mapping.dto';

@Injectable()
export class MappingsService {
  private readonly logger = new Logger(MappingsService.name);

  /** Safe chunk size for Prisma $transaction batches (avoids timeouts/OOM at 100k+ items). */
  private readonly BULK_CHUNK_SIZE = 500;

  constructor(private prisma: PrismaService) {}

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

    return this.prisma.weezeventLocationSpaceMapping.upsert({
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
  }

  async deleteLocationSpaceMapping(tenantId: string, weezeventLocationId: string) {
    this.logger.log(`Deleting location-space mapping for location ${weezeventLocationId}`);
    return this.prisma.weezeventLocationSpaceMapping.deleteMany({
      where: { tenantId, weezeventLocationId },
    });
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
      where.weezeventMerchantId = { in: merchantTxs.map((m) => m.merchantId).filter(Boolean) };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    const skip = (Math.max(page, 1) - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.prisma.weezeventMerchantElementMapping.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.weezeventMerchantElementMapping.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async createMerchantElementMapping(dto: CreateMerchantElementMappingDto, tenantId: string) {
    this.logger.log(`Mapping merchant ${dto.weezeventMerchantId} → element ${dto.spaceElementId}`);

    return this.prisma.weezeventMerchantElementMapping.upsert({
      where: {
        tenantId_weezeventMerchantId: {
          tenantId,
          weezeventMerchantId: dto.weezeventMerchantId,
        },
      },
      create: {
        tenantId,
        weezeventMerchantId: dto.weezeventMerchantId,
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
            this.prisma.weezeventMerchantElementMapping.upsert({
              where: {
                tenantId_weezeventMerchantId: {
                  tenantId,
                  weezeventMerchantId: m.weezeventMerchantId,
                },
              },
              create: {
                tenantId,
                weezeventMerchantId: m.weezeventMerchantId,
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
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err.message}`);
        for (const m of chunk) {
          try {
            const result = await this.prisma.weezeventMerchantElementMapping.upsert({
              where: {
                tenantId_weezeventMerchantId: { tenantId, weezeventMerchantId: m.weezeventMerchantId },
              },
              create: { tenantId, weezeventMerchantId: m.weezeventMerchantId, spaceElementId: m.spaceElementId },
              update: { spaceElementId: m.spaceElementId },
            });
            successes.push(result);
          } catch (itemErr) {
            errors.push({ weezeventMerchantId: m.weezeventMerchantId, error: itemErr.message });
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
    return this.prisma.weezeventMerchantElementMapping.deleteMany({
      where: { tenantId, weezeventMerchantId },
    });
  }

  // ─── Product → MenuItem ──────────────────────────────────

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
          weezeventProduct: true,
          menuItem: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.weezeventProductMapping.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
    };
  }

  async bulkProductMappings(dto: BulkProductMappingDto, tenantId: string, userId: string) {
    const total = dto.mappings.length;
    this.logger.log(`Bulk mapping ${total} product-menu item pairs (chunk=${this.BULK_CHUNK_SIZE})`);

    const successes: any[] = [];
    const errors: { weezeventProductId: string; error: string }[] = [];

    for (let i = 0; i < total; i += this.BULK_CHUNK_SIZE) {
      const chunk = dto.mappings.slice(i, i + this.BULK_CHUNK_SIZE);
      try {
        const results = await this.prisma.$transaction(
          chunk.map((m) =>
            this.prisma.weezeventProductMapping.upsert({
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
            }),
          ),
        );
        successes.push(...results);
      } catch (err) {
        this.logger.warn(`Chunk ${i / this.BULK_CHUNK_SIZE} failed, falling back to per-item upserts: ${err.message}`);
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
            errors.push({ weezeventProductId: m.weezeventProductId, error: itemErr.message });
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
        const merchantMappings = await this.prisma.weezeventMerchantElementMapping.count({
          where: {
            tenantId,
            weezeventMerchantId: { in: merchantIds },
          },
        });
        step2 = merchantMappings > 0;
      }

      // Step 3: Product→MenuItem mappings exist?
      const productMappings = await this.prisma.weezeventProductMapping.count({
        where: { tenantId },
      });
      step3 = productMappings > 0;

      // Step 4: Aggregation jobs completed?
      const completedJobs = await this.prisma.aggregationJobLog.count({
        where: {
          tenantId,
          spaceId: locationMapping.spaceId,
          status: 'completed',
        },
      });
      step4 = completedJobs > 0;

      // Step 5: Space revenue aggregations exist?
      const aggregations = await this.prisma.spaceRevenueDailyAgg.count({
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
   * Retourne la progression d'intégration pour toutes les locations Weezevent du tenant.
   * Optimisé : précharge les compteurs en parallèle pour éviter N×5 queries.
   * Utilisé par l'écran "LocationListItem" du wizard.
   */
  async getAllIntegrationProgress(tenantId: string) {
    this.logger.log(`Fetching integration progress for all locations of tenant ${tenantId}`);

    // 1. Toutes les locations Weezevent connues (via sync)
    const locations = await this.prisma.weezeventLocation.findMany({
      where: { tenantId },
      select: { id: true, weezeventId: true, name: true },
    });

    if (locations.length === 0) {
      return { data: [], meta: { total: 0 } };
    }

    const weezeventLocationIds = locations.map((l) => l.weezeventId);

    // 2. Précharge en parallèle (évite N×5 queries série)
    const [
      locationMappings,
      merchantTxGroups,
      merchantMappings,
      productMappingsCount,
      aggJobs,
      revenueAggs,
    ] = await Promise.all([
      this.prisma.weezeventLocationSpaceMapping.findMany({
        where: { tenantId, weezeventLocationId: { in: weezeventLocationIds } },
        select: { weezeventLocationId: true, spaceId: true },
      }),
      // Distinct merchants per location
      this.prisma.weezeventTransaction.findMany({
        where: {
          tenantId,
          locationId: { in: weezeventLocationIds },
          merchantId: { not: null },
        },
        select: { locationId: true, merchantId: true },
        distinct: ['locationId', 'merchantId'],
      }),
      this.prisma.weezeventMerchantElementMapping.findMany({
        where: { tenantId },
        select: { weezeventMerchantId: true },
      }),
      this.prisma.weezeventProductMapping.count({ where: { tenantId } }),
      this.prisma.aggregationJobLog.groupBy({
        by: ['spaceId'],
        where: { tenantId, status: 'completed' },
        _count: true,
      }),
      this.prisma.spaceRevenueDailyAgg.groupBy({
        by: ['spaceId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    // Index en Maps pour lookups O(1)
    const locSpaceMap = new Map(locationMappings.map((m) => [m.weezeventLocationId, m.spaceId]));
    const mappedMerchantSet = new Set(merchantMappings.map((m) => m.weezeventMerchantId));
    const merchantsByLocation = new Map<string, string[]>();
    for (const tx of merchantTxGroups) {
      if (!tx.locationId || !tx.merchantId) continue;
      const list = merchantsByLocation.get(tx.locationId) ?? [];
      list.push(tx.merchantId);
      merchantsByLocation.set(tx.locationId, list);
    }
    const aggJobsBySpace = new Set(aggJobs.map((j) => j.spaceId).filter(Boolean));
    const revenueBySpace = new Set(revenueAggs.map((r) => r.spaceId).filter(Boolean));

    // 3. Calcul par location
    const data = locations.map((loc) => {
      const spaceId = locSpaceMap.get(loc.weezeventId) ?? null;
      const step1 = !!spaceId;

      const merchants = merchantsByLocation.get(loc.weezeventId) ?? [];
      const step2 = merchants.length > 0 && merchants.some((m) => mappedMerchantSet.has(m));

      // step3: product mappings existent (global au tenant, pas par location)
      const step3 = productMappingsCount > 0;

      const step4 = !!spaceId && aggJobsBySpace.has(spaceId);
      const step5 = !!spaceId && revenueBySpace.has(spaceId);

      const completedSteps = [step1, step2, step3, step4, step5].filter(Boolean).length;

      return {
        weezeventLocationId: loc.weezeventId,
        name: loc.name,
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
      this.prisma.weezeventMerchantElementMapping.count({ where: { tenantId } }),
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
