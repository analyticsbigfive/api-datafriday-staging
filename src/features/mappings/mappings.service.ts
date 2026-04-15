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

  constructor(private prisma: PrismaService) {}

  // ─── Location → Space ───────────────────────────────────

  async getLocationSpaceMappings(tenantId: string) {
    this.logger.log(`Fetching location-space mappings for tenant ${tenantId}`);
    return this.prisma.weezeventLocationSpaceMapping.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
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

  async getMerchantElementMappings(tenantId: string, weezeventLocationId?: string) {
    this.logger.log(`Fetching merchant-element mappings for tenant ${tenantId}`);

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

    return this.prisma.weezeventMerchantElementMapping.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
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
    this.logger.log(`Bulk mapping ${dto.mappings.length} merchant-element pairs`);

    const results = await this.prisma.$transaction(
      dto.mappings.map((m) =>
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

    return { count: results.length, mappings: results };
  }

  async deleteMerchantElementMapping(tenantId: string, weezeventMerchantId: string) {
    return this.prisma.weezeventMerchantElementMapping.deleteMany({
      where: { tenantId, weezeventMerchantId },
    });
  }

  // ─── Product → MenuItem ──────────────────────────────────

  async getProductMappings(tenantId: string, weezeventLocationId?: string) {
    this.logger.log(`Fetching product mappings for tenant ${tenantId}`);

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

    return this.prisma.weezeventProductMapping.findMany({
      where,
      include: {
        weezeventProduct: true,
        menuItem: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async bulkProductMappings(dto: BulkProductMappingDto, tenantId: string, userId: string) {
    this.logger.log(`Bulk mapping ${dto.mappings.length} product-menu item pairs`);

    const results = await this.prisma.$transaction(
      dto.mappings.map((m) =>
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

    return { count: results.length, mappings: results };
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
}
