import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { QuerySpaceDto } from './dto/query-space.dto';

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new space for a tenant
   */
  async create(tenantId: string, dto: CreateSpaceDto) {
    const space = await this.prisma.space.create({
      data: {
        tenantId,
        // Basic Information
        name: dto.name,
        image: dto.image,
        // Space Details
        spaceType: dto.spaceType,
        spaceTypeOther: dto.spaceTypeOther,
        maxCapacity: dto.maxCapacity,
        department: dto.department,
        homeTeam: dto.homeTeam,
        // Address
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country,
        // Contact Information
        tel: dto.tel,
        email: dto.email,
        // Main Contact Person
        mainContactPerson: dto.mainContactPerson,
        contactEmail: dto.contactEmail,
        contactTel: dto.contactTel,
        // Social Media
        instagram: dto.instagram,
        tiktok: dto.tiktok,
        facebook: dto.facebook,
        twitter: dto.twitter,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return space;
  }

  /**
   * Find all spaces for a tenant with pagination
   */
  async findAll(tenantId: string, query: QuerySpaceDto) {
    const { search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
    };

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const [spaces, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          image: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
          tel: true,
          email: true,
          contactTel: true,
          contactEmail: true,
          mainContactPerson: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          postcode: true,
          department: true,
          country: true,
          spaceType: true,
          spaceTypeOther: true,
          maxCapacity: true,
          homeTeam: true,
          facebook: true,
          instagram: true,
          twitter: true,
          tiktok: true,
          avgEvent: true,
          avgTransaction: true,
          perCapita: true,
          cachedMetrics: true,
          _count: {
            select: {
              configs: true,
              pinnedByUsers: true,
            },
          },
        },
      }),
      this.prisma.space.count({ where }),
    ]);

    return {
      data: spaces,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one space by ID
   */
  async findOne(id: string, tenantId: string) {
    const space = await this.prisma.space.findFirst({
      where: {
        id,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        image: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        tel: true,
        email: true,
        contactTel: true,
        contactEmail: true,
        mainContactPerson: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        department: true,
        country: true,
        spaceType: true,
        spaceTypeOther: true,
        maxCapacity: true,
        homeTeam: true,
        facebook: true,
        instagram: true,
        twitter: true,
        tiktok: true,
        avgEvent: true,
        avgTransaction: true,
        perCapita: true,
        cachedMetrics: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        configs: {
          select: {
            id: true,
            name: true,
            spaceId: true,
            capacity: true,
            data: true,  // Include full configuration data (floors, forecourt, externalMerch)
            createdAt: true,
            updatedAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            pinnedByUsers: true,
            userAccess: true,
          },
        },
      },
    });

    if (!space) {
      throw new NotFoundException(`Space with ID ${id} not found`);
    }

    return space;
  }

  /**
   * Update a space
   */
  async update(id: string, tenantId: string, dto: UpdateSpaceDto) {
    // Verify space exists and belongs to tenant
    await this.findOne(id, tenantId);

    const space = await this.prisma.space.update({
      where: { id },
      data: {
        // Basic Information
        name: dto.name,
        image: dto.image,
        // Space Details
        spaceType: dto.spaceType,
        spaceTypeOther: dto.spaceTypeOther,
        maxCapacity: dto.maxCapacity,
        department: dto.department,
        homeTeam: dto.homeTeam,
        // Address
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postcode: dto.postcode,
        country: dto.country,
        // Contact Information
        tel: dto.tel,
        email: dto.email,
        // Main Contact Person
        mainContactPerson: dto.mainContactPerson,
        contactEmail: dto.contactEmail,
        contactTel: dto.contactTel,
        // Social Media
        instagram: dto.instagram,
        tiktok: dto.tiktok,
        facebook: dto.facebook,
        twitter: dto.twitter,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    return space;
  }

  /**
   * Delete a space
   */
  async remove(id: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(id, tenantId);

    await this.prisma.space.delete({
      where: { id },
    });

    return {
      message: 'Space deleted successfully',
    };
  }

  /**
   * Pin a space for a user
   */
  async pin(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Check if already pinned
    const existing = await this.prisma.userPinnedSpace.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (existing) {
      return {
        message: 'Space already pinned',
        pinned: existing,
      };
    }

    const pinned = await this.prisma.userPinnedSpace.create({
      data: {
        userId,
        spaceId,
      },
      include: {
        space: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    return {
      message: 'Space pinned successfully',
      pinned,
    };
  }

  /**
   * Unpin a space for a user
   */
  async unpin(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const existing = await this.prisma.userPinnedSpace.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Space is not pinned');
    }

    await this.prisma.userPinnedSpace.delete({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    return {
      message: 'Space unpinned successfully',
    };
  }

  /**
   * Get pinned spaces for a user
   */
  async getPinned(userId: string, tenantId: string) {
    const pinned = await this.prisma.userPinnedSpace.findMany({
      where: {
        userId,
        space: {
          tenantId,
        },
      },
      include: {
        space: {
          include: {
            _count: {
              select: {
                configs: true,
              },
            },
          },
        },
      },
      orderBy: {
        pinnedAt: 'desc',
      },
    });

    return pinned.map((p) => p.space);
  }

  /**
   * Grant user access to a space
   */
  async grantAccess(
    spaceId: string,
    userId: string,
    role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER',
    tenantId: string,
  ) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Verify user belongs to same tenant
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found in this tenant');
    }

    // Check if access already exists
    const existing = await this.prisma.userSpaceAccess.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (existing) {
      // Update role if different
      if (existing.role !== role) {
        return await this.prisma.userSpaceAccess.update({
          where: {
            userId_spaceId: {
              userId,
              spaceId,
            },
          },
          data: { role },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            space: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      }
      return existing;
    }

    const access = await this.prisma.userSpaceAccess.create({
      data: {
        userId,
        spaceId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        space: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return access;
  }

  /**
   * Revoke user access to a space
   */
  async revokeAccess(spaceId: string, userId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const existing = await this.prisma.userSpaceAccess.findUnique({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('User access not found');
    }

    await this.prisma.userSpaceAccess.delete({
      where: {
        userId_spaceId: {
          userId,
          spaceId,
        },
      },
    });

    return {
      message: 'Access revoked successfully',
    };
  }

  /**
   * Get users with access to a space
   */
  async getSpaceUsers(spaceId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const users = await this.prisma.userSpaceAccess.findMany({
      where: {
        spaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: {
        grantedAt: 'desc',
      },
    });

    return users;
  }

  /**
   * Get space statistics
   */
  async getStatistics(tenantId: string) {
    const [totalSpaces, totalConfigs, recentSpaces] = await Promise.all([
      this.prisma.space.count({
        where: { tenantId },
      }),
      this.prisma.config.count({
        where: {
          space: {
            tenantId,
          },
        },
      }),
      this.prisma.space.findMany({
        where: { tenantId },
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          image: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totalSpaces,
      totalConfigs,
      recentSpaces,
    };
  }

  /**
   * Update space image
   */
  async updateImage(id: string, tenantId: string, image: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(id, tenantId);

    const space = await this.prisma.space.update({
      where: { id },
      data: { image },
      select: {
        id: true,
        name: true,
        image: true,
        updatedAt: true,
      },
    });

    return space;
  }

  /**
   * Get configurations for a space (optimized - no double verification)
   */
  async getConfigurations(spaceId: string, tenantId: string) {
    // Direct query with tenant verification in the join
    const configurations = await this.prisma.config.findMany({
      where: {
        spaceId,
        space: {
          tenantId, // Verify tenant access directly in query
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        capacity: true,
        createdAt: true,
        updatedAt: true,
        // Don't include full data here - it's loaded separately when needed
        _count: {
          select: {
            floors: true,
            stations: true,
          },
        },
      },
    });

    return configurations;
  }

  /**
   * Get shop details (granular sales data) for a space
   * Returns all SpaceElements (shops) created in configurations for this space
   * with their aggregated sales data if available from Weezevent
   */
  async getShopDetails(spaceId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Get all configurations for this space
    const configs = await this.prisma.config.findMany({
      where: {
        space: {
          id: spaceId,
          tenantId,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const configIds = configs.map(c => c.id);

    // Get all SpaceElements (shops) from floors in these configurations
    const shopsFromFloors = await this.prisma.spaceElement.findMany({
      where: {
        floor: {
          configId: { in: configIds },
        },
        type: {
          in: ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'],
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        shopTypes: true,
        attributes: true,
        floor: {
          select: {
            id: true,
            name: true,
            config: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Get all SpaceElements (shops) from forecourt in these configurations
    const shopsFromForecourt = await this.prisma.spaceElement.findMany({
      where: {
        forecourt: {
          configId: { in: configIds },
        },
        type: {
          in: ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'],
        },
      },
      select: {
        id: true,
        name: true,
        type: true,
        shopTypes: true,
        attributes: true,
        forecourt: {
          select: {
            id: true,
            name: true,
            config: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Combine all shops
    const allShops = [...shopsFromFloors, ...shopsFromForecourt];

    // Get revenue data for these shops (if mapped to Weezevent)
    const shopIds = allShops.map(s => s.id);

    // Build a map for quick shop lookup
    const shopMap = new Map(allShops.map(s => [s.id, s]));

    // --- Per-shop totals (for the shops list) ---
    const revenueData = await this.prisma.spaceRevenueDailyAgg.groupBy({
      by: ['spaceElementId'],
      where: {
        tenantId,
        spaceId,
        spaceElementId: { in: shopIds },
      },
      _sum: {
        revenueHt: true,
        transactionsCount: true,
        itemsCount: true,
      },
    });

    // Create a map of revenue by shop
    const revenueByShop = new Map(
      revenueData.map(r => [
        r.spaceElementId!,
        {
          revenue: Number(r._sum.revenueHt || 0),
          transactionCount: r._sum.transactionsCount || 0,
          itemsCount: r._sum.itemsCount || 0,
        },
      ]),
    );

    // Get Weezevent merchant mappings for these shops
    const merchantMappings = await this.prisma.weezeventMerchantElementMapping.findMany({
      where: {
        tenantId,
        spaceElementId: { in: shopIds },
      },
      select: {
        spaceElementId: true,
        weezeventMerchantId: true,
      },
    });

    const mappingByShop = new Map(
      merchantMappings.map(m => [m.spaceElementId, m.weezeventMerchantId]),
    );

     // --- Per-event × shop × product granular data (3-dimension raw SQL) ---
    // Joins: WeezeventTransaction → TransactionItems → MerchantElementMapping
    //        → SpaceElement / WeezeventEvent / WeezeventProduct
    //        → WeezeventProductMapping → MenuItem → ProductType / ProductCategory
    const granularRows: any[] = shopIds.length > 0
      ? await this.prisma.$queryRaw`
          SELECT
            t."eventId"                                                    AS "weezeventEventId",
            we.name                                                        AS "eventName",
            we."startDate"                                                 AS "eventDate",
            mem."spaceElementId",
            se.name                                                        AS "shopName",
            COALESCE(se.attributes::jsonb->>'originalType', se.type::text) AS "shopType",
            se.attributes::jsonb->>'area'                                  AS "shopArea",
            ti."productId"                                                 AS "weezeventProductId",
            wpm."menuItemId",
            mi.name                                                        AS "menuItemName",
            pt.name                                                        AS "menuItemType",
            pc.name                                                        AS "menuItemCategory",
            mi."totalCost"                                                 AS "itemCost",
            SUM(
              ti."unitPrice" * ti.quantity
              / (1 + COALESCE(p."vatRate", 20) / 100)
            )::numeric(12,2)                                               AS "revenueHt",
            SUM(ti.quantity)::integer                                      AS quantity,
            COUNT(DISTINCT t.id)::integer                                  AS "transactionCount"
          FROM "WeezeventTransaction" t
          INNER JOIN "WeezeventTransactionItem" ti
            ON ti."transactionId" = t.id
          INNER JOIN "WeezeventMerchantElementMapping" mem
            ON mem."weezeventMerchantId" = t."locationId"
           AND mem."tenantId"         = ${tenantId}
           AND mem."spaceElementId"   = ANY(${shopIds})
          INNER JOIN "SpaceElement" se
            ON se.id = mem."spaceElementId"
          LEFT JOIN "WeezeventEvent" we
            ON we.id = t."eventId"
          LEFT JOIN "WeezeventProduct" p
            ON p.id = ti."productId"
          LEFT JOIN "WeezeventProductMapping" wpm
            ON wpm."weezeventProductId" = ti."productId"
           AND wpm."tenantId" = ${tenantId}
          LEFT JOIN "MenuItem" mi
            ON mi.id = wpm."menuItemId"
          LEFT JOIN "ProductType" pt
            ON pt.id = mi."typeId"
          LEFT JOIN "ProductCategory" pc
            ON pc.id = mi."categoryId"
          WHERE t."tenantId" = ${tenantId}
            AND t.status    = 'completed'
            AND t."eventId" IS NOT NULL
          GROUP BY
            t."eventId", we.name, we."startDate",
            mem."spaceElementId", se.name, se.type, se.attributes,
            ti."productId", wpm."menuItemId", mi.name, pt.name, pc.name, mi."totalCost",
            p."vatRate"
        `
      : [];

    // --- Build shopGranularData (one record per event × shop × product) ---
    const shopGranularData = granularRows
      .filter((r: any) => r.weezeventEventId && r.spaceElementId)
      .map((r: any) => ({
        // Unique identifier matching mock format
        elementId: `${r.spaceElementId}_${r.weezeventProductId ?? 'unmapped'}_${r.weezeventEventId}`,
        // Event dimensions
        eventId:   r.weezeventEventId,
        eventName: r.eventName ?? r.weezeventEventId,
        eventDate: r.eventDate ?? null,
        // Shop dimensions
        shopId:   r.spaceElementId,
        shopName: r.shopName ?? r.spaceElementId,
        shopType: r.shopType ?? null,
        shopArea: r.shopArea ?? null,
        // Product dimensions (null when product unmapped to MenuItem)
        menuItemId:       r.menuItemId ?? r.weezeventProductId,
        menuItemName:     r.menuItemName ?? null,
        menuItemType:     r.menuItemType ?? null,
        menuItemCategory: r.menuItemCategory ?? null,
        // Metrics
        revenue:          Number(r.revenueHt  || 0),
        quantity:         Number(r.quantity   || 0),
        transactionCount: Number(r.transactionCount || 0),
      }));

    // --- Build menuItemCostMap { menuItemId → cost } for margin calculation ---
    const menuItemCostMap: Record<string, number> = {};
    for (const r of granularRows) {
      const key: string | null = r.menuItemId ?? r.weezeventProductId;
      if (key && r.itemCost != null && !(key in menuItemCostMap)) {
        menuItemCostMap[key] = Number(r.itemCost);
      }
    }

    // --- Build events list with attendee counts ---
    const eventIds = [...new Set(
      granularRows
        .map((r: any) => r.weezeventEventId as string | null)
        .filter((id): id is string => id !== null),
    )];

    const attendeeCounts = eventIds.length > 0
      ? await this.prisma.weezeventAttendee.groupBy({
          by: ['eventId'],
          where: { tenantId, eventId: { in: eventIds } },
          _count: { id: true },
        })
      : [];
    const attendeeCountMap = new Map(attendeeCounts.map(a => [a.eventId!, a._count.id]));

    // Fetch enrichment metadata from WeezeventEvent records
    const weezeventEventMeta = eventIds.length > 0
      ? await this.prisma.weezeventEvent.findMany({
          where: { id: { in: eventIds }, tenantId },
          select: { id: true, metadata: true },
        })
      : [];
    const eventMetaMap = new Map(weezeventEventMeta.map(e => [e.id, e.metadata as Record<string, any> | null]));

    const seenEventIds = new Set<string>();
    const events = granularRows
      .filter((r: any) => {
        if (!r.weezeventEventId) return false;
        if (seenEventIds.has(r.weezeventEventId)) return false;
        seenEventIds.add(r.weezeventEventId);
        return true;
      })
      .map((r: any) => {
        const meta = eventMetaMap.get(r.weezeventEventId) ?? {};
        return {
          id:             r.weezeventEventId,
          name:           r.eventName ?? r.weezeventEventId,
          eventName:      r.eventName ?? r.weezeventEventId,
          date:           r.eventDate ?? null,
          ticketsScanned: attendeeCountMap.get(r.weezeventEventId) ?? 0,
          attendees:      attendeeCountMap.get(r.weezeventEventId) ?? 0,
          isFuture:       r.eventDate ? new Date(r.eventDate) > new Date() : false,
          doorsOpening:   meta?.doorsOpening   ?? null,
          showTime:       meta?.showTime       ?? null,
          category:       meta?.category       ?? null,
          eventType:      meta?.eventType      ?? null,
          team:           meta?.team           ?? null,
          visitingTeam:   meta?.visitingTeam   ?? null,
          hasIntermission: meta?.hasIntermission ?? false,
        };
      });

    // --- Build shops list (per-shop summary for the builder/overview panels) ---
    const shops = allShops.map(shop => {
      const revenue = revenueByShop.get(shop.id);
      const weezeventMerchantId = mappingByShop.get(shop.id);
      const location = 'floor' in shop ? shop.floor : shop.forecourt;
      const attrs = shop.attributes as any;

      return {
        shopId: shop.id,
        shopName: shop.name,
        shopType: attrs?.originalType || this.reverseMapElementType(shop.type),
        shopSubTypes: shop.shopTypes,
        configId: location.config.id,
        configName: location.config.name,
        locationId: location.id,
        locationName: location.name,
        locationType: 'floor' in shop ? 'floor' : 'forecourt',
        revenue: revenue?.revenue || 0,
        transactionCount: revenue?.transactionCount || 0,
        itemsCount: revenue?.itemsCount || 0,
        isMappedToWeezevent: !!weezeventMerchantId,
        weezeventMerchantId: weezeventMerchantId || null,
      };
    });

    return { shops, shopGranularData, events, menuItemCostMap };
  }

  /**
   * Get minute-level timeline for one event: minute × shop × menuItem
   * Returns one record per (minute, spaceElementId, weezeventProductId) combination.
   */
  async getEventTimeline(spaceId: string, eventId: string, tenantId: string) {
    // Verify space belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Get mapped shop IDs for this space to scope the join
    const configs = await this.prisma.config.findMany({
      where: { space: { id: spaceId, tenantId } },
      select: { id: true },
    });
    const configIds = configs.map(c => c.id);

    const shopsFromFloors = await this.prisma.spaceElement.findMany({
      where: { floor: { configId: { in: configIds } }, type: { in: ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'] } },
      select: { id: true },
    });
    const shopsFromForecourt = await this.prisma.spaceElement.findMany({
      where: { forecourt: { configId: { in: configIds } }, type: { in: ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'] } },
      select: { id: true },
    });
    const shopIds = [...shopsFromFloors, ...shopsFromForecourt].map(s => s.id);

    if (shopIds.length === 0) return [];

    const rows: any[] = await this.prisma.$queryRaw`
      SELECT
        TO_CHAR(DATE_TRUNC('minute', t."transactionDate"), 'HH24:MI')    AS minute,
        mem."spaceElementId"                                              AS "shopId",
        se.name                                                           AS "shopName",
        COALESCE(se.attributes::jsonb->>'originalType', se.type::text)   AS "shopType",
        se.attributes::jsonb->>'area'                                     AS "shopArea",
        ti."productId"                                                    AS "weezeventProductId",
        wpm."menuItemId",
        mi.name                                                           AS "menuItemName",
        pt.name                                                           AS "menuItemType",
        pc.name                                                           AS "menuItemCategory",
        SUM(ti.quantity)::integer                                         AS quantity,
        COUNT(DISTINCT t.id)::integer                                     AS "transactionCount",
        SUM(
          ti."unitPrice" * ti.quantity
          / (1 + COALESCE(p."vatRate", 20) / 100)
        )::numeric(12,2)                                                  AS "revenueHt"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventTransactionItem" ti
        ON ti."transactionId" = t.id
      INNER JOIN "WeezeventMerchantElementMapping" mem
        ON mem."weezeventMerchantId" = t."locationId"
       AND mem."tenantId"         = ${tenantId}
       AND mem."spaceElementId"   = ANY(${shopIds})
      INNER JOIN "SpaceElement" se
        ON se.id = mem."spaceElementId"
      LEFT JOIN "WeezeventProduct" p
        ON p.id = ti."productId"
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = ti."productId"
       AND wpm."tenantId" = ${tenantId}
      LEFT JOIN "MenuItem" mi
        ON mi.id = wpm."menuItemId"
      LEFT JOIN "ProductType" pt
        ON pt.id = mi."typeId"
      LEFT JOIN "ProductCategory" pc
        ON pc.id = mi."categoryId"
      WHERE t."tenantId" = ${tenantId}
        AND t."eventId"  = ${eventId}
        AND t.status     = 'completed'
      GROUP BY
        DATE_TRUNC('minute', t."transactionDate"),
        mem."spaceElementId", se.name, se.type, se.attributes,
        ti."productId", wpm."menuItemId", mi.name, pt.name, pc.name,
        p."vatRate"
      ORDER BY minute ASC
    `;

    return rows.map((r: any) => ({
      minute:           r.minute,
      shopId:           r.shopId,
      shopName:         r.shopName,
      shopType:         r.shopType ?? null,
      shopArea:         r.shopArea ?? null,
      weezeventProductId: r.weezeventProductId ?? null,
      menuItemId:       r.menuItemId ?? null,
      menuItemName:     r.menuItemName ?? null,
      menuItemType:     r.menuItemType ?? null,
      menuItemCategory: r.menuItemCategory ?? null,
      quantity:         Number(r.quantity         || 0),
      transactionCount: Number(r.transactionCount || 0),
      revenueHt:        Number(r.revenueHt        || 0),
      revenue:          Number(r.revenueHt        || 0),
    }));
  }

  /**
   * List all WeezeventEvents linked to a space (via integration scoped to tenant).
   * Returns event data with enrichment metadata (doorsOpening, showTime, category, etc.).
   */
  async getWeezeventEventsForSpace(spaceId: string, tenantId: string) {
    // Verify space belongs to tenant
    await this.findOne(spaceId, tenantId);

    // Find the integration linked to this space
    const integration = await this.prisma.weezeventIntegration.findFirst({
      where: { tenantId, locationId: spaceId },
      select: { id: true },
    });

    if (!integration) {
      return [];
    }

    const events = await this.prisma.weezeventEvent.findMany({
      where: { tenantId, integrationId: integration.id },
      select: {
        id: true,
        weezeventId: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        metadata: true,
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      weezeventId: e.weezeventId,
      name: e.name,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.status,
      doorsOpening:  (e.metadata as any)?.doorsOpening  ?? null,
      showTime:      (e.metadata as any)?.showTime      ?? null,
      category:      (e.metadata as any)?.category      ?? null,
      eventType:     (e.metadata as any)?.eventType     ?? null,
      team:          (e.metadata as any)?.team          ?? null,
      visitingTeam:  (e.metadata as any)?.visitingTeam  ?? null,
      hasIntermission: (e.metadata as any)?.hasIntermission ?? false,
    }));
  }

  /**
   * Update enrichment metadata for a single WeezeventEvent.
   * Only fields explicitly provided in the payload are updated (shallow merge).
   */
  async updateWeezeventEventMetadata(
    spaceId: string,
    eventId: string,
    payload: {
      doorsOpening?: string | null;
      showTime?: string | null;
      category?: string | null;
      eventType?: string | null;
      team?: string | null;
      visitingTeam?: string | null;
      hasIntermission?: boolean;
    },
    tenantId: string,
  ) {
    // Verify space belongs to tenant
    await this.findOne(spaceId, tenantId);

    const event = await this.prisma.weezeventEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, metadata: true },
    });

    if (!event) {
      throw new NotFoundException(`WeezeventEvent ${eventId} not found`);
    }

    const existingMeta = (event.metadata as Record<string, unknown>) ?? {};
    const updatedMeta = { ...existingMeta, ...payload };

    const updated = await this.prisma.weezeventEvent.update({
      where: { id: eventId },
      data: { metadata: updatedMeta },
      select: {
        id: true,
        weezeventId: true,
        name: true,
        startDate: true,
        metadata: true,
      },
    });

    return {
      id: updated.id,
      weezeventId: updated.weezeventId,
      name: updated.name,
      startDate: updated.startDate,
      doorsOpening:   (updated.metadata as any)?.doorsOpening   ?? null,
      showTime:       (updated.metadata as any)?.showTime       ?? null,
      category:       (updated.metadata as any)?.category       ?? null,
      eventType:      (updated.metadata as any)?.eventType      ?? null,
      team:           (updated.metadata as any)?.team           ?? null,
      visitingTeam:   (updated.metadata as any)?.visitingTeam   ?? null,
      hasIntermission: (updated.metadata as any)?.hasIntermission ?? false,
    };
  }

  /**
   * Create or update a configuration with normalized tables
   */
  async saveConfiguration(dto: any, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(dto.spaceId, tenantId);

    if (dto.id) {
      // Check if config exists without throwing exception
      const existingConfig = await this.prisma.config.findFirst({
        where: {
          id: dto.id,
          space: {
            tenantId,
          },
        },
      });

      // If config exists, verify it belongs to the correct space
      if (existingConfig && existingConfig.spaceId !== dto.spaceId) {
        throw new ForbiddenException('Configuration does not belong to the provided space');
      }
    }

    // Extract floors and elements from data
    const floors = dto.data?.floors || [];
    const forecourt = dto.data?.forecourt || null;

    // Use a transaction to ensure data consistency
    return await this.prisma.$transaction(async (tx) => {
      // 1. Create or update the config
      let config;
      if (dto.id) {
        config = await tx.config.upsert({
          where: { id: dto.id },
          update: {
            name: dto.name,
            capacity: dto.capacity,
            data: dto.data,
            updatedAt: new Date(),
          },
          create: {
            id: dto.id,
            name: dto.name,
            spaceId: dto.spaceId,
            capacity: dto.capacity,
            data: dto.data,
          },
        });
      } else {
        config = await tx.config.create({
          data: {
            name: dto.name,
            spaceId: dto.spaceId,
            capacity: dto.capacity,
            data: dto.data,
          } as any,
        });
      }

      // 2. Delete existing floors and their elements (cascade)
      await tx.floor.deleteMany({
        where: { configId: config.id },
      });

      // 3. Create floors with their elements
      for (const floor of floors) {
        const createdFloor = await tx.floor.create({
          data: {
            ...(floor.id ? { id: floor.id } : {}),
            configId: config.id,
            name: floor.name,
            level: floor.level || 0,
            width: floor.width || 800,
            height: floor.height || 600,
            length: floor.length || 100,
            cornerRadius: floor.cornerRadius || null,
          } as any,
        });

        // Create elements for this floor
        const elements = floor.elements || [];
        for (const element of elements) {
          // Map frontend type to enum, but store original in attributes
          const elementType = this.mapElementType(element.type);
          const originalType = element.type; // Keep the original like 'fnb-food'
          
          const createdElement = await tx.spaceElement.create({
            data: {
              ...(element.id ? { id: element.id } : {}),
              floorId: createdFloor.id,
              name: element.name || 'Element',
              type: elementType,
              x: element.x || 0,
              y: element.y || 0,
              width: element.width || 80,
              height: element.height || 60,
              depth: element.depth || element.height || 60,
              height3d: element.height3d || 25,
              rotation: element.rotation || 0,
              image: element.image || null,
              notes: element.notes || null,
              capacity: element.capacity || null,
              cornerRadiusTL: element.cornerRadius?.topLeft || 0,
              cornerRadiusTR: element.cornerRadius?.topRight || 0,
              cornerRadiusBL: element.cornerRadius?.bottomLeft || 0,
              cornerRadiusBR: element.cornerRadius?.bottomRight || 0,
              shopTypes: element.shopType || [],
              storageTypes: element.storageType || [],
              hospitalityTypes: element.hospitalityType || [],
              accessTypes: element.accessType || [],
              entertainmentTypes: element.entertainmentType || [],
              entranceTypes: element.entranceType || [],
              kitchenTypes: element.kitchenType || [],
              tags: element.tags || [],
              // Store original type and other attributes
              attributes: { ...element.attributes, originalType },
            } as any,
          });

          // Create performance data if exists
          if (element.performance) {
            await tx.elementPerformance.create({
              data: {
                elementId: createdElement.id,
                revenue: element.performance.revenue || 0,
                numberOfPOS: element.performance.numberOfPOS || 0,
                numberOfTransactions: element.performance.numberOfTransactions || 0,
                transactionsPerMinute: element.performance.transactionsPerMinute || 0,
                staffCost: element.performance.staffCost || 0,
                revenuePerEmployee: element.performance.revenuePerEmployee || 0,
              },
            });
          }

          // Create staff positions if exist
          if (element.staffPositions && element.staffPositions.length > 0) {
            await tx.elementStaff.createMany({
              data: element.staffPositions.map((pos: any) => ({
                elementId: createdElement.id,
                position: pos.position,
                count: pos.count || 1,
                hourlyRate: pos.hourlyRate || null,
              })),
            });
          }

          // Create inventory items if exist
          if (element.inventoryItems && element.inventoryItems.length > 0) {
            await tx.elementInventory.createMany({
              data: element.inventoryItems.map((item: any) => ({
                elementId: createdElement.id,
                name: item.name,
                quantity: item.quantity || 0,
                unit: item.unit || null,
                minStock: item.minStock || null,
                maxStock: item.maxStock || null,
                isCustom: item.isCustom !== false,
                menuItemId: item.menuItemId || null,
              })),
            });
          }
        }
      }

      // 4. Handle forecourt if exists
      if (forecourt) {
        // Delete existing forecourt
        await tx.forecourt.deleteMany({
          where: { configId: config.id },
        });

        const createdForecourt = await tx.forecourt.create({
          data: {
            ...(forecourt.id ? { id: forecourt.id } : {}),
            configId: config.id,
            name: forecourt.name || 'Parvis',
            width: forecourt.width || 1000,
            length: forecourt.length || 500,
          } as any,
        });

        // Create forecourt elements
        const forecourtElements = forecourt.elements || [];
        for (const element of forecourtElements) {
          const elementType = this.mapElementType(element.type);
          const originalType = element.type; // Keep the original type
          
          const createdElement = await tx.spaceElement.create({
            data: {
              ...(element.id ? { id: element.id } : {}),
              forecourtId: createdForecourt.id,
              name: element.name || 'Element',
              type: elementType,
              x: element.x || 0,
              y: element.y || 0,
              width: element.width || 80,
              height: element.height || 60,
              depth: element.depth || 60,
              height3d: element.height3d || 25,
              rotation: element.rotation || 0,
              image: element.image || null,
              notes: element.notes || null,
              capacity: element.capacity || null,
              cornerRadiusTL: element.cornerRadius?.topLeft || 0,
              cornerRadiusTR: element.cornerRadius?.topRight || 0,
              cornerRadiusBL: element.cornerRadius?.bottomLeft || 0,
              cornerRadiusBR: element.cornerRadius?.bottomRight || 0,
              shopTypes: element.shopType || [],
              storageTypes: element.storageType || [],
              hospitalityTypes: element.hospitalityType || [],
              accessTypes: element.accessType || [],
              entertainmentTypes: element.entertainmentType || [],
              entranceTypes: element.entranceType || [],
              kitchenTypes: element.kitchenType || [],
              tags: element.tags || [],
              attributes: { ...element.attributes, originalType },
            } as any,
          });

          // Create performance, staff, inventory for forecourt elements
          if (element.performance) {
            await tx.elementPerformance.create({
              data: {
                elementId: createdElement.id,
                revenue: element.performance.revenue || 0,
                numberOfPOS: element.performance.numberOfPOS || 0,
                numberOfTransactions: element.performance.numberOfTransactions || 0,
                transactionsPerMinute: element.performance.transactionsPerMinute || 0,
                staffCost: element.performance.staffCost || 0,
                revenuePerEmployee: element.performance.revenuePerEmployee || 0,
              },
            });
          }

          if (element.staffPositions && element.staffPositions.length > 0) {
            await tx.elementStaff.createMany({
              data: element.staffPositions.map((pos: any) => ({
                elementId: createdElement.id,
                position: pos.position,
                count: pos.count || 1,
                hourlyRate: pos.hourlyRate || null,
              })),
            });
          }

          if (element.inventoryItems && element.inventoryItems.length > 0) {
            await tx.elementInventory.createMany({
              data: element.inventoryItems.map((item: any) => ({
                elementId: createdElement.id,
                name: item.name,
                quantity: item.quantity || 0,
                unit: item.unit || null,
                minStock: item.minStock || null,
                maxStock: item.maxStock || null,
                isCustom: item.isCustom !== false,
                menuItemId: item.menuItemId || null,
              })),
            });
          }
        }
      }

      return config;
    });
  }

  /**
   * Map frontend element type to Prisma ElementType enum
   * Frontend uses composite types like 'fnb-food', 'merch-temporary'
   * We map to the closest enum value or 'other' as fallback
   */
  private mapElementType(type: string): any {
    if (!type) return 'other';
    
    // Direct mappings
    const directMap: Record<string, string> = {
      'shop': 'shop',
      'storage': 'storage',
      'hospitality': 'hospitality',
      'access': 'access',
      'entertainment': 'entertainment',
      'entrance': 'entrance',
      'merchshop': 'merchshop',
      'kitchen': 'kitchen',
      'seating': 'seating',
      'stage': 'stage',
      'parking': 'parking',
      'restroom': 'restroom',
      'office': 'office',
      'other': 'other',
    };
    
    if (directMap[type]) return directMap[type];
    
    // F&B types
    if (type.startsWith('fnb-')) {
      const subType = type.replace('fnb-', '');
      const fnbMap: Record<string, string> = {
        'food': 'fnb_food',
        'beverages': 'fnb_beverages',
        'bar': 'fnb_bar',
        'snack': 'fnb_snack',
        'icecream': 'fnb_icecream',
        'beer': 'fnb_bar',
        'gppremium': 'fnb_food',
        'temporary': 'fnb_food',
        'drinkee': 'fnb_beverages',
      };
      return fnbMap[subType] || 'fnb_food';
    }
    
    // Merch types
    if (type.startsWith('merch-')) {
      return 'merchshop';
    }
    
    // Storage types
    if (type.startsWith('storage-')) {
      return 'storage';
    }
    
    // Hospitality types
    if (type.startsWith('hospitality-')) {
      return 'hospitality';
    }
    
    // Access types
    if (type.startsWith('access-')) {
      return 'access';
    }
    
    // Entertainment types  
    if (type.startsWith('entertainment-')) {
      return 'entertainment';
    }
    
    // Entrance types
    if (type.startsWith('entrance-')) {
      return 'entrance';
    }
    
    // Kitchen types
    if (type.startsWith('kitchen-')) {
      return 'kitchen';
    }
    
    return 'other';
  }

  /**
   * Set pinned spaces for a user (replace all)
   */
  async setPinnedSpaces(userId: string, tenantId: string, spaceIds: string[]) {
    // Verify all spaces exist and belong to tenant
    const validSpaces = await this.prisma.space.findMany({
      where: {
        id: { in: spaceIds },
        tenantId,
      },
      select: { id: true },
    });

    const validSpaceIds = validSpaces.map((s) => s.id);

    // Delete all current pinned spaces for this user in this tenant
    await this.prisma.userPinnedSpace.deleteMany({
      where: {
        userId,
        space: {
          tenantId,
        },
      },
    });

    // Create new pinned spaces
    if (validSpaceIds.length > 0) {
      await this.prisma.userPinnedSpace.createMany({
        data: validSpaceIds.map((spaceId) => ({
          userId,
          spaceId,
        })),
      });
    }

    // Return updated pinned spaces
    return this.getPinned(userId, tenantId);
  }

  /**
   * Get a single configuration by ID
   * Optimized: Uses JSON blob for fast display, normalized tables for queries
   */
  async getConfiguration(configId: string, tenantId: string) {
    // Fast query - only get config with JSON data
    const config = await this.prisma.config.findFirst({
      where: {
        id: configId,
        space: {
          tenantId,
        },
      },
      select: {
        id: true,
        name: true,
        spaceId: true,
        capacity: true,
        data: true,
        createdAt: true,
        updatedAt: true,
        space: {
          select: {
            id: true,
            name: true,
            tenantId: true,
          },
        },
      },
    });

    if (!config) {
      throw new NotFoundException(`Configuration with ID ${configId} not found`);
    }

    // Use JSON data directly for fast loading
    // JSON is always kept in sync during save operations
    const jsonData = config.data as any;

    // Return config with JSON data for frontend
    return {
      id: config.id,
      name: config.name,
      spaceId: config.spaceId,
      capacity: config.capacity,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      space: config.space,
      data: {
        floors: jsonData?.floors || [],
        forecourt: jsonData?.forecourt || null,
      },
    };
  }

  /**
   * Transform a floor element from DB to frontend format
   */
  private transformElement(element: any) {
    // Use originalType from attributes if available, otherwise reverse map from enum
    const attrs = element.attributes as any;
    const originalType = attrs?.originalType || this.reverseMapElementType(element.type);
    
    return {
      id: element.id,
      name: element.name,
      type: originalType, // Return original frontend type
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      depth: element.depth,
      height3d: element.height3d,
      rotation: element.rotation,
      image: element.image,
      notes: element.notes,
      capacity: element.capacity,
      cornerRadius: {
        topLeft: element.cornerRadiusTL,
        topRight: element.cornerRadiusTR,
        bottomLeft: element.cornerRadiusBL,
        bottomRight: element.cornerRadiusBR,
      },
      shopType: element.shopTypes,
      storageType: element.storageTypes,
      hospitalityType: element.hospitalityTypes,
      accessType: element.accessTypes,
      entertainmentType: element.entertainmentTypes,
      entranceType: element.entranceTypes,
      kitchenType: element.kitchenTypes,
      tags: element.tags,
      attributes: element.attributes,
      // Light performance - only revenue for quick display
      performance: element.performance
        ? {
            revenue: element.performance.revenue,
            // Other fields loaded on-demand via getElementDetails
          }
        : null,
      // Staff and inventory loaded on-demand
      staffPositions: element.staffPositions?.map((s: any) => ({
        id: s.id,
        position: s.position,
        count: s.count,
        hourlyRate: s.hourlyRate,
      })) || [],
      inventoryItems: element.inventoryItems?.map((i: any) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        minStock: i.minStock,
        maxStock: i.maxStock,
        isCustom: i.isCustom,
        menuItemId: i.menuItemId,
      })) || [],
    };
  }

  /**
   * Reverse map Prisma ElementType enum to frontend type
   */
  private reverseMapElementType(type: string): string {
    const reverseMap: Record<string, string> = {
      'fnb_food': 'fnb-food',
      'fnb_beverages': 'fnb-beverages',
      'fnb_bar': 'fnb-bar',
      'fnb_snack': 'fnb-snack',
      'fnb_icecream': 'fnb-icecream',
      'shop': 'shop',
      'storage': 'storage',
      'hospitality': 'hospitality',
      'access': 'access',
      'entertainment': 'entertainment',
      'entrance': 'entrance',
      'merchshop': 'merchshop',
      'kitchen': 'kitchen',
      'seating': 'seating',
      'stage': 'stage',
      'parking': 'parking',
      'restroom': 'restroom',
      'office': 'office',
      'other': 'other',
    };
    return reverseMap[type] || type;
  }

  /**
   * Update a SpaceElement (shop) — name, image, type, shopTypes
   */
  async updateSpaceElement(elementId: string, tenantId: string, dto: { name?: string; image?: string; notes?: string; type?: string; shopTypes?: string[] }) {
    // Verify the element belongs to this tenant via its floor or forecourt → config → space
    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: {
        floor: { include: { config: { include: { space: true } } } },
        forecourt: { include: { config: { include: { space: true } } } },
      },
    });

    if (!element) {
      throw new Error(`SpaceElement ${elementId} not found`);
    }

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space;
    if (!space || space.tenantId !== tenantId) {
      throw new Error(`SpaceElement ${elementId} does not belong to tenant`);
    }

    const updated = await this.prisma.spaceElement.update({
      where: { id: elementId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.type !== undefined && { type: dto.type as any }),
        ...(dto.shopTypes !== undefined && { shopTypes: dto.shopTypes }),
      },
    });

    return updated;
  }

  /**
   * Quick-create a SpaceElement (shop) for a space without needing the floor plan editor.
   * Finds or creates a "Weezevent Import" config + floor, then creates the element there.
   */
  async quickCreateElement(spaceId: string, tenantId: string, dto: { name: string; type?: string }) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new Error('Space not found or access denied');

    // Find or create the "Weezevent Import" configuration
    let config = await this.prisma.config.findFirst({
      where: { spaceId, name: 'Weezevent Import' },
      include: { floors: true },
    });

    if (!config) {
      config = await this.prisma.config.create({
        data: { spaceId, name: 'Weezevent Import', data: {} },
        include: { floors: true },
      });
    }

    // Find or create a default floor in that config
    let floor = config.floors?.[0];
    if (!floor) {
      floor = await this.prisma.floor.create({
        data: { configId: config.id, name: 'Import', level: 0, width: 800, height: 600, length: 100 },
      });
    }

    const elementType = this.mapElementType(dto.type || 'shop');

    const element = await this.prisma.spaceElement.create({
      data: {
        floorId: floor.id,
        name: dto.name,
        type: elementType,
        x: 0,
        y: 0,
        width: 80,
        height: 60,
        depth: 60,
        shopTypes: [],
        storageTypes: [],
        hospitalityTypes: [],
        accessTypes: [],
        entertainmentTypes: [],
        entranceTypes: [],
        kitchenTypes: [],
        attributes: { originalType: dto.type || 'shop', importedFromWeezevent: true },
      } as any,
    });

    return {
      id: element.id,
      name: element.name,
      type: dto.type || 'shop',
      configName: config.name,
      areaName: floor.name,
    };
  }

  /**
   * Delete a configuration
   */
  async deleteConfiguration(configId: string, tenantId: string) {
    // Verify configuration exists and belongs to tenant
    await this.getConfiguration(configId, tenantId);

    await this.prisma.config.delete({
      where: { id: configId },
    });

    return { message: 'Configuration deleted successfully' };
  }
}
