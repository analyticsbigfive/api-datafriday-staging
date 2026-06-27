import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { QuerySpaceDto } from './dto/query-space.dto';
import { WeezeventClientService } from '../weezevent/services/weezevent-client.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';

/**
 * Nom de la configuration interne auto-générée par le backend lors de l'import Weezevent.
 * Elle est désormais discriminée par `Config.isSystem = true` ; ce nom reste utilisé en
 * fallback de compatibilité pour les configs créées avant la migration `isSystem`.
 */
export const WEEZEVENT_IMPORT_CONFIG_NAME = 'Weezevent Import';

@Injectable()
export class SpacesService {
  private readonly SPACES_CACHE_TTL = 60; // 60 seconds
  private readonly SPACE_DETAIL_CACHE_TTL = 120; // 2 minutes for individual space
  private readonly SPACES_LIST_CACHE_KEY = (tenantId: string) =>
    `spaces:list:${tenantId}`;
  private readonly SPACES_LIGHT_CACHE_KEY = (tenantId: string) =>
    `spaces:light:${tenantId}`;
  private readonly SPACE_DETAIL_CACHE_KEY = (spaceId: string) =>
    `spaces:detail:${spaceId}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly weezeventClient: WeezeventClientService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  /**
   * Périmètre d'espaces de l'utilisateur pour le filtrage des LISTES.
   * Retourne `null` = accès complet (aucun filtre, cache tenant-wide autorisé),
   * sinon la liste des spaceId accessibles (cache tenant-wide à NE PAS utiliser).
   */
  private async restrictedSpaceIds(
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ): Promise<string[] | null> {
    const ids = await this.spaceAccess.getAccessibleSpaceIds(user);
    return ids === 'ALL' ? null : ids;
  }

  /** Invalidate all space list caches for a tenant */
  private async invalidateSpaceCache(tenantId: string, spaceId?: string) {
    const keys = [
      this.redis.delete(this.SPACES_LIST_CACHE_KEY(tenantId)),
      this.redis.delete(this.SPACES_LIGHT_CACHE_KEY(tenantId)),
    ];
    if (spaceId) keys.push(this.redis.delete(this.SPACE_DETAIL_CACHE_KEY(spaceId)));
    await Promise.all(keys);
  }

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

    await this.invalidateSpaceCache(tenantId);
    return space;
  }

  /**
   * Find all spaces for a tenant with pagination (Redis-cached, TTL 60s).
   * Cache is bypassed when a search filter is applied.
   */
  async findAll(tenantId: string, query: QuerySpaceDto, user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>) {
    const { search, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Périmètre espaces : null = accès complet ; sinon liste restreinte.
    const accessibleIds = await this.restrictedSpaceIds(user);

    // Cache tenant-wide réservé aux utilisateurs à accès complet (sinon fuite d'espaces
    // non autorisés à un user restreint).
    const isCacheable = !search && page === 1 && limit === 10 && accessibleIds === null;
    if (isCacheable) {
      const cached = await this.redis.get<any>(this.SPACES_LIST_CACHE_KEY(tenantId));
      if (cached) return cached;
    }

    const where: any = {
      tenantId,
    };

    if (accessibleIds !== null) {
      where.id = { in: accessibleIds };
    }

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

    const result = {
      data: spaces,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    if (isCacheable) {
      await this.redis.set(this.SPACES_LIST_CACHE_KEY(tenantId), result, {
        ttl: this.SPACES_CACHE_TTL,
      });
    }

    return result;
  }

  /**
   * Lightweight space list for selects/wizards — only id + name.
   * Redis-cached (TTL 60s). ~10x faster than findAll.
   */
  async getSpacesLight(
    tenantId: string,
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ): Promise<{ id: string; name: string }[]> {
    const accessibleIds = await this.restrictedSpaceIds(user);
    const cacheKey = this.SPACES_LIGHT_CACHE_KEY(tenantId);

    // Cache tenant-wide réservé aux accès complets.
    if (accessibleIds === null) {
      const cached = await this.redis.get<{ id: string; name: string }[]>(cacheKey);
      if (cached) return cached;
    }

    const where: any = { tenantId };
    if (accessibleIds !== null) where.id = { in: accessibleIds };

    const spaces = await this.prisma.space.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (accessibleIds === null) {
      await this.redis.set(cacheKey, spaces, { ttl: this.SPACES_CACHE_TTL });
    }
    return spaces;
  }

  /**
   * Find one space by ID
   */
  async findOne(id: string, tenantId: string) {
    const cacheKey = this.SPACE_DETAIL_CACHE_KEY(id);
    const cached = await this.redis.get<any>(cacheKey);
    if (cached && cached.tenantId === tenantId) return cached;

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
            isSystem: true,
            data: true,  // Include full configuration data (floors, forecourt, externalMerch)
            createdAt: true,
            updatedAt: true,
          },
          // configs utilisateur d'abord (isSystem=false), puis par ancienneté, afin que
          // l'import interne "Weezevent Import" ne soit jamais sélectionné par défaut.
          orderBy: [
            { isSystem: 'asc' },
            { createdAt: 'asc' },
          ],
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

    // Cache the result to skip 3 round-trips on subsequent loads (TTL 2 min)
    await this.redis.set(cacheKey, space, { ttl: this.SPACE_DETAIL_CACHE_TTL });

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

    await this.invalidateSpaceCache(tenantId, id);
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

    await this.invalidateSpaceCache(tenantId, id);
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
  async getPinned(
    userId: string,
    tenantId: string,
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
    const accessibleIds = await this.restrictedSpaceIds(user);
    const spaceWhere: any = { tenantId };
    if (accessibleIds !== null) spaceWhere.id = { in: accessibleIds };

    const pinned = await this.prisma.userPinnedSpace.findMany({
      where: {
        userId,
        space: spaceWhere,
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
      // Configs utilisateur (isSystem=false) d'abord, puis par ancienneté : la
      // config par défaut sélectionnée côté builder (configs[0]) est donc toujours
      // une config utilisateur, jamais l'import interne « Weezevent Import ».
      orderBy: [
        { isSystem: 'asc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        capacity: true,
        isSystem: true,
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
   * Get shop list only (no transaction data) — used by SpaceMenuView for fast initial load
   */
  async getSpaceShops(spaceId: string, tenantId: string) {
    // Lightweight ownership check — avoids the heavy findOne with _count aggregates and full configs
    const spaceExists = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
      select: { id: true },
    });
    if (!spaceExists) {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }

    // Direct spaceId lookup — no JOIN through Space needed since ownership is already verified
    const configs = await this.prisma.config.findMany({
      where: { spaceId },
      select: { id: true, name: true },
    });

    const configIds = configs.map(c => c.id);
    const shopTypes: any[] = ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'];
    // Exclude menuAssignments from SpaceElement queries — fetched in parallel below
    const commonSelect = {
      id: true, name: true, type: true, shopTypes: true, attributes: true, image: true, notes: true,
    };

    const [shopsFromFloors, shopsFromForecourt]: [any[], any[]] = await Promise.all([
      (this.prisma.spaceElement.findMany as any)({
        where: { floor: { configId: { in: configIds } }, type: { in: shopTypes } },
        select: { ...commonSelect, floor: { select: { id: true, name: true, level: true, config: { select: { id: true, name: true } } } } },
      }),
      (this.prisma.spaceElement.findMany as any)({
        where: { forecourt: { configId: { in: configIds } }, type: { in: shopTypes } },
        select: { ...commonSelect, forecourt: { select: { id: true, name: true, config: { select: { id: true, name: true } } } } },
      }),
    ]);

    const allShops: any[] = [...shopsFromFloors, ...shopsFromForecourt];
    const shopIds: string[] = allShops.map((s: any) => s.id);

    // Fetch merchant mappings and menu assignments in parallel
    const [merchantMappings, enabledMenuAssignments] = await Promise.all([
      this.prisma.weezeventLocationShopMapping.findMany({
        where: { tenantId, spaceElementId: { in: shopIds } },
        select: { spaceElementId: true, weezeventLocationId: true },
      }),
      this.prisma.menuAssignment.findMany({
        where: { enabled: true, elementId: { in: shopIds } },
        select: { elementId: true },
      }),
    ]);

    const mappingByShop = new Map(merchantMappings.map(m => [m.spaceElementId, m.weezeventLocationId]));
    const menuAssignmentCountByShop = enabledMenuAssignments.reduce<Record<string, number>>((acc, ma) => {
      acc[ma.elementId] = (acc[ma.elementId] ?? 0) + 1;
      return acc;
    }, {});

    const shops = allShops.map(s => {
      const floor = (s as any).floor;
      const loc = floor ?? (s as any).forecourt;
      const menuItemsEnabledCount = menuAssignmentCountByShop[s.id] ?? 0;
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        shopTypes: s.shopTypes,
        attributes: s.attributes,
        image: (s as any).image ?? null,
        notes: (s as any).notes ?? null,
        configId: loc?.config?.id ?? null,
        configName: loc?.config?.name ?? null,
        locationId: loc?.id ?? null,
        locationName: loc?.name ?? null,
        floorLevel: floor ? floor.level : (s as any).forecourt ? 'forecourt' : null,
        weezeventLocationId: mappingByShop.get(s.id) ?? null,
        isMappedToWeezevent: mappingByShop.has(s.id),
        menuItemsCount: menuItemsEnabledCount,
        isOpen: menuItemsEnabledCount > 0,
      };
    });

    return { shops };
  }

  /**
   * Get shop details (granular sales data) for a space.
   * Delegates to the Supabase PostgreSQL RPC `get_space_shop_details`,
   * collapsing 8 sequential DB round-trips into a single network call (~2s → ~300ms).
   */
  async getShopDetails(spaceId: string, tenantId: string, page = 1, limit = 20, includeGranular = false) {
    const rows = await this.prisma.$queryRaw<Array<{ get_space_shop_details: any }>>`
      SELECT get_space_shop_details(${spaceId}, ${tenantId}, ${page}::int, ${limit}::int, ${includeGranular}::boolean)
    `;
    const data = rows[0]?.get_space_shop_details;
    if (!data || data.__error === 'space_not_found') {
      throw new NotFoundException(`Space with ID ${spaceId} not found`);
    }
    return data;
  }

  /**
   * Get minute-level timeline for one event: minute × shop × menuItem
   * Returns one record per (minute, spaceElementId, weezeventProductId) combination.
   */
  async getEventTimeline(spaceId: string, eventId: string, tenantId: string) {
    // All independent queries run in parallel: ownership check, event dates (tried
    // against both DataFriday Event and WeezeventEvent so the frontend can pass
    // either a DataFriday UUID or a WeezeventEvent CUID), integration scope, and
    // shop IDs resolved from plan floors + forecourt.
    const [, datafridayEvent, weezeventEvent, locationMapping, shopIds] = await Promise.all([
      this.findOne(spaceId, tenantId),
      this.prisma.event.findFirst({
        where: { id: eventId, tenantId, spaceId },
        select: { eventDate: true, eventEndDate: true },
      }),
      this.prisma.weezeventEvent.findFirst({
        where: { id: eventId, tenantId },
        select: { startDate: true, endDate: true },
      }),
      this.prisma.weezeventLocationSpaceMapping.findFirst({
        where: { tenantId, spaceId },
        select: { weezeventLocationId: true },
      }),
      this.prisma.config.findMany({
        where: { space: { id: spaceId, tenantId } },
        select: { id: true },
      }).then(async (configs) => {
        const configIds = configs.map(c => c.id);
        const [floors, forecourt] = await Promise.all([
          this.prisma.spaceElement.findMany({
            where: { floor: { configId: { in: configIds } }, type: { in: ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'] } },
            select: { id: true },
          }),
          this.prisma.spaceElement.findMany({
            where: { forecourt: { configId: { in: configIds } }, type: { in: ['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop'] } },
            select: { id: true },
          }),
        ]);
        return [...floors, ...forecourt].map(s => s.id);
      }),
    ]);

    // Resolve date window: prefer DataFriday Event (accurate multi-day), fall back to
    // WeezeventEvent (when the frontend passes a Weezevent CUID instead of a DataFriday UUID).
    const resolvedEventDate: Date | null = datafridayEvent
      ? new Date(datafridayEvent.eventDate)
      : weezeventEvent?.startDate
        ? new Date(weezeventEvent.startDate)
        : null;

    const resolvedEndDate: Date | null = datafridayEvent
      ? new Date(datafridayEvent.eventEndDate ?? datafridayEvent.eventDate)
      : weezeventEvent?.endDate
        ? new Date(weezeventEvent.endDate)
        : resolvedEventDate;

    // Event not found in either table → nothing to show
    if (!resolvedEventDate) return [];
    if (shopIds.length === 0) return [];

    // Date window: event day (or multi-day if eventEndDate/endDate is set)
    const eventDate = resolvedEventDate;
    const windowEnd = new Date(resolvedEndDate!);
    windowEnd.setDate(windowEnd.getDate() + 1);

    // Scope transactions to the integration that feeds this space (étape 1 du wizard).
    // WeezeventLocationSpaceMapping.weezeventLocationId stores the integrationId.
    // If no mapping yet, fall back to tenant-wide (degraded mode, broader scope).
    const integrationId = locationMapping?.weezeventLocationId ?? null;
    const integrationClause = integrationId
      ? Prisma.sql`AND t."integrationId" = ${integrationId}`
      : Prisma.sql``;

    const rows: any[] = await this.prisma.$queryRaw(Prisma.sql`
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
      INNER JOIN "WeezeventLocationShopMapping" mem
        ON mem."weezeventLocationId" = t."locationId"
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
        ${integrationClause}
        AND t."transactionDate" >= ${eventDate}
        AND t."transactionDate" <  ${windowEnd}
        AND t.status = 'V'
      GROUP BY
        DATE_TRUNC('minute', t."transactionDate"),
        mem."spaceElementId", se.name, se.type, se.attributes,
        ti."productId", wpm."menuItemId", mi.name, pt.name, pc.name,
        p."vatRate"
      ORDER BY minute ASC
    `);

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

    // Find the integration linked to this space via location mapping
    const locationMapping = await this.prisma.weezeventLocationSpaceMapping.findFirst({
      where: { tenantId, spaceId },
      select: { weezeventLocationId: true },
    });

    if (!locationMapping) {
      return [];
    }

    const location = await this.prisma.weezeventLocation.findFirst({
      where: { id: locationMapping.weezeventLocationId, tenantId },
      select: { integrationId: true },
    });

    if (!location) {
      return [];
    }

    const integration = { id: location.integrationId };

    const events = await this.prisma.weezeventEvent.findMany({
      where: { tenantId, integrationId: integration.id },
      select: {
        id: true,
        weezeventId: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        configurationId: true,
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
      configurationId: e.configurationId ?? null,
      doorsOpening:    (e.metadata as any)?.doorsOpening    ?? null,
      showTime:        (e.metadata as any)?.showTime        ?? null,
      category:        (e.metadata as any)?.category        ?? null,
      eventType:       (e.metadata as any)?.eventType       ?? null,
      team:            (e.metadata as any)?.team            ?? null,
      visitingTeam:    (e.metadata as any)?.visitingTeam    ?? null,
      hasIntermission: (e.metadata as any)?.hasIntermission ?? false,
      performer:       (e.metadata as any)?.performer       ?? null,
      openingAct:      (e.metadata as any)?.openingAct      ?? null,
      sponsor:         (e.metadata as any)?.sponsor         ?? null,
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
      performer?: string | null;
      openingAct?: string | null;
      sponsor?: string | null;
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
        configurationId: true,
        metadata: true,
      },
    });

    return {
      id: updated.id,
      weezeventId: updated.weezeventId,
      name: updated.name,
      startDate: updated.startDate,
      configurationId: updated.configurationId ?? null,
      doorsOpening:    (updated.metadata as any)?.doorsOpening    ?? null,
      showTime:        (updated.metadata as any)?.showTime        ?? null,
      category:        (updated.metadata as any)?.category        ?? null,
      eventType:       (updated.metadata as any)?.eventType       ?? null,
      team:            (updated.metadata as any)?.team            ?? null,
      visitingTeam:    (updated.metadata as any)?.visitingTeam    ?? null,
      hasIntermission: (updated.metadata as any)?.hasIntermission ?? false,
      performer:       (updated.metadata as any)?.performer       ?? null,
      openingAct:      (updated.metadata as any)?.openingAct      ?? null,
      sponsor:         (updated.metadata as any)?.sponsor         ?? null,
    };
  }

  /**
   * Sync attendees for a single WeezeventEvent from the WeezPay API.
   * Paginates through GET /organizations/{org}/events/{eventId}/attendees,
   * upserts each record into WeezeventAttendee, and returns the total count.
   * ticketsScanned in getShopDetails() is computed from WeezeventAttendee rows
   * so it will reflect the updated count automatically.
   */
  async syncEventAttendees(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<{ synced: number }> {
    await this.findOne(spaceId, tenantId);

    const event = await this.prisma.weezeventEvent.findFirst({
      where: { id: eventId, tenantId },
      select: { id: true, weezeventId: true, integrationId: true },
    });
    if (!event) {
      throw new NotFoundException(`WeezeventEvent ${eventId} not found`);
    }

    const integration = await this.prisma.weezeventIntegration.findFirst({
      where: { id: event.integrationId, tenantId },
      select: { id: true, organizationId: true },
    });
    if (!integration?.organizationId) {
      throw new NotFoundException('WeezeventIntegration organization ID not configured');
    }

    let page = 1;
    let hasMore = true;
    let synced = 0;

    while (hasMore) {
      const response = await this.weezeventClient.getAttendees(
        tenantId,
        integration.organizationId,
        event.weezeventId,
        { page, perPage: 100 },
      );

      for (const a of response.data) {
        const weezeventId = String(a.id ?? a.attendee_id ?? `${page}_${synced}`);
        await this.prisma.weezeventAttendee.upsert({
          where: {
            tenantId_integrationId_weezeventId: {
              tenantId,
              integrationId: event.integrationId,
              weezeventId,
            },
          },
          create: {
            weezeventId,
            tenantId,
            integrationId: event.integrationId,
            eventId: event.id,
            eventName: a.event_name ?? null,
            email:     a.email      ?? null,
            firstName: a.first_name ?? null,
            lastName:  a.last_name  ?? null,
            ticketType: typeof a.ticket_type === 'string' ? a.ticket_type : (a.ticket_type?.name ?? null),
            status:    a.status ?? 'registered',
            rawData:   a,
          },
          update: {
            status:    a.status ?? 'registered',
            email:     a.email      ?? null,
            firstName: a.first_name ?? null,
            lastName:  a.last_name  ?? null,
            ticketType: typeof a.ticket_type === 'string' ? a.ticket_type : (a.ticket_type?.name ?? null),
            rawData:   a,
            syncedAt:  new Date(),
          },
        });
        synced++;
      }

      hasMore = page < response.meta.total_pages;
      page++;
    }

    return { synced };
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

      // 2a. Safety guard: preserve elements that have Weezevent mappings but are absent from
      // the incoming JSON (can happen with legacy data created before the JSON-sync fix).
      // We re-inject them into the floors payload so deleteMany + recreate keeps them intact.
      if (dto.id) {
        // Collect all element IDs already present in the incoming JSON payload
        const incomingElementIds = new Set<string>();
        for (const f of floors) {
          for (const el of f.elements || []) {
            if (el.id) incomingElementIds.add(el.id);
          }
        }
        for (const fce of forecourt?.elements || []) {
          if (fce.id) incomingElementIds.add(fce.id);
        }

        // Find existing elements in this config that have Weezevent mappings
        const existingFloors = await tx.floor.findMany({
          where: { configId: config.id },
          include: { elements: true },
        });
        const allExistingElements = existingFloors.flatMap((f: any) => f.elements);
        const existingIds = allExistingElements.map((e: any) => e.id);

        if (existingIds.length > 0) {
          const mappedElements = await tx.weezeventLocationShopMapping.findMany({
            where: { spaceElementId: { in: existingIds } },
            select: { spaceElementId: true },
          });
          const mappedIds = new Set(mappedElements.map((m: any) => m.spaceElementId));

          // Elements that have mappings but are not in the incoming JSON
          const orphaned = allExistingElements.filter(
            (e: any) => mappedIds.has(e.id) && !incomingElementIds.has(e.id),
          );

          if (orphaned.length > 0) {
            // Ré-injecter les éléments mappés absents du JSON pour ne pas les perdre au
            // delete+recreate — SANS jamais créer de floor « Import ». On les loge sur le
            // 1er floor existant du payload (RDC en priorité), sinon on crée un RDC neutre.
            let orphanFloor =
              floors.find((f: any) => f.level === 0) ?? floors[0];
            if (!orphanFloor) {
              orphanFloor = {
                name: 'RDC',
                level: 0,
                width: 100,
                height: 4,
                length: 100,
                elements: [],
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
                hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
              };
              floors.push(orphanFloor);
            }
            if (!Array.isArray(orphanFloor.elements)) orphanFloor.elements = [];

            for (const el of orphaned) {
              const attrs = el.attributes as any;
              orphanFloor.elements.push({
                id: el.id,
                name: el.name,
                type: attrs?.originalType ?? 'shop',
                x: el.x ?? 0,
                y: el.y ?? 0,
                width: el.width ?? 80,
                height: el.height ?? 60,
                depth: el.depth ?? 60,
                shopType: el.shopTypes ?? [],
                storageType: el.storageTypes ?? [],
                hospitalityType: el.hospitalityTypes ?? [],
                accessType: el.accessTypes ?? [],
                entertainmentType: el.entertainmentTypes ?? [],
                entranceType: el.entranceTypes ?? [],
                kitchenType: el.kitchenTypes ?? [],
                attributes: attrs ?? {},
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              });
            }

            console.warn(
              `[saveConfiguration] Re-injected ${orphaned.length} Weezevent-mapped element(s) absent from JSON payload for config ${config.id}`,
            );
          }
        }
      }

      // 2b. Capture des MenuAssignment des éléments de cette config AVANT le delete
      // (cascade Floor → SpaceElement → MenuAssignment). Ils ne sont pas sérialisés dans
      // le JSON ; sans cette sauvegarde, delete+recreate les perdrait. Les ids d'éléments
      // étant préservés à la recréation (`...(element.id ? { id } : {})`), on peut les ré-insérer.
      const preservedAssignments = await tx.menuAssignment.findMany({
        where: {
          OR: [
            { element: { floor: { configId: config.id } } },
            { element: { forecourt: { configId: config.id } } },
          ],
        },
        select: { elementId: true, menuItemId: true, enabled: true },
      });

      // 2c. Delete existing floors and their elements (cascade)
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
        // Keep the JSON floor id in sync with the relational row so getConfiguration
        // never sees two floors at the same level (root cause of shops vanishing in the
        // Space Builder). When `floor.id` was absent, Prisma generated one — adopt it.
        floor.id = createdFloor.id;

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
          // Sync the JSON element id with the relational row (see floor.id note above).
          element.id = createdElement.id;

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
        forecourt.id = createdForecourt.id;

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
          element.id = createdElement.id;

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

      // 5. Restaurer les MenuAssignment capturés en 2b pour les éléments recréés
      // (ids préservés). Seuls ceux dont l'élément existe encore sont ré-insérés ;
      // skipDuplicates respecte la contrainte @@unique([elementId, menuItemId]).
      if (preservedAssignments.length > 0) {
        const assignmentElementIds = [
          ...new Set(preservedAssignments.map((a) => a.elementId).filter((id): id is string => !!id)),
        ];
        const stillExisting = await tx.spaceElement.findMany({
          where: { id: { in: assignmentElementIds } },
          select: { id: true },
        });
        const existingIds = new Set(stillExisting.map((e) => e.id));
        const toRestore = preservedAssignments.filter((a) => a.elementId && existingIds.has(a.elementId));
        if (toRestore.length > 0) {
          await tx.menuAssignment.createMany({
            data: toRestore.map((a) => ({ elementId: a.elementId!, menuItemId: a.menuItemId, enabled: a.enabled })),
            skipDuplicates: true,
          });
        }
      }

      // 6. Persist the reconciled JSON: floor/element ids generated by Prisma above were
      // written back into `floors`/`forecourt`, so re-saving config.data keeps the JSON
      // blob and the relational rows on the SAME ids. Without this, a floor created
      // without an id (3D Builder) keeps id=null in JSON while its relational row gets a
      // cuid → getConfiguration would otherwise emit duplicate floors at the same level.
      const reconciledData = { ...(dto.data || {}), floors };
      if (forecourt !== null) reconciledData.forecourt = forecourt;
      await tx.config.update({ where: { id: config.id }, data: { data: reconciledData } });

      // Return the config WITH the reconciled data so the caller (3D Builder) can adopt
      // the real floor/element ids instead of keeping its temporary client-side ones.
      return { ...config, data: reconciledData };
    });
  }

  /**
   * Map frontend element type to Prisma ElementType enum
   * Frontend uses composite types like 'fnb-food', 'merch-temporary'
   * We map to the closest enum value or 'other' as fallback
   */
  private mapElementType(type: string): any {
    if (!type || typeof type !== 'string') return 'other';

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
   * Map a frontend F&B sub-type (e.g. 'fnb-beverages') to the shopTypes tags
   * used by the 3D builder's shop type filter (food/beverages/beer/gppremium/temporary/drinkee).
   */
  private mapShopTypeTags(type?: string): string[] {
    if (!type || !type.startsWith('fnb-')) return [];
    const subType = type.replace('fnb-', '');
    const tagMap: Record<string, string> = {
      food: 'food',
      beverages: 'beverages',
      bar: 'beer',
      snack: 'food',
      icecream: 'food',
      beer: 'beer',
      gppremium: 'gppremium',
      temporary: 'temporary',
      drinkee: 'drinkee',
    };
    const tag = tagMap[subType];
    return tag ? [tag] : [];
  }

  /**
   * Set pinned spaces for a user (replace all)
   */
  async setPinnedSpaces(
    userId: string,
    tenantId: string,
    spaceIds: string[],
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>,
  ) {
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
    return this.getPinned(userId, tenantId, user);
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
        isSystem: true,
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

    const jsonData = config.data as any;
    const rawJsonFloors: any[] = Array.isArray(jsonData?.floors) ? jsonData.floors : [];

    // Relational Floor/SpaceElement rows are the source of truth for elements created
    // outside the 3D Builder (Data Integration: quickCreateElement / assign-floor).
    const relationalFloors = await this.prisma.floor.findMany({
      where: { configId },
      include: { elements: true },
    });

    // ── Collapse floors by business key = `level` ───────────────────────────────
    // The Space Builder (front) dedupes floors by `level`; if this endpoint returns
    // two floors sharing the same level it silently keeps one and DROPS the other's
    // elements. That desync happens whenever a floor's id diverges between `config.data`
    // (JSON) and the relational `Floor` row — e.g. a 3D-Builder save that created the
    // floor without an id → generated cuid never written back to JSON, then Data
    // Integration adds shops under the relational id. To be robust to such data we merge
    // EVERYTHING into exactly one floor per level, combining all elements (deduped by id).
    const levelKey = (f: any): number =>
      typeof f?.level === 'number' && !Number.isNaN(f.level) ? f.level : 0;

    interface LevelBucket {
      base: any | null;             // geometry / hole / name (JSON when available)
      baseId?: string;              // a real floor id seen in the JSON for this level
      elements: Map<string, any>;   // element id → serialized element
      idlessElements: any[];        // JSON elements without an id (kept as-is)
      relFloors: { id: string; count: number }[];
    }
    const byLevel = new Map<number, LevelBucket>();
    const bucketFor = (lvl: number): LevelBucket => {
      let b = byLevel.get(lvl);
      if (!b) {
        b = { base: null, elements: new Map(), idlessElements: [], relFloors: [] };
        byLevel.set(lvl, b);
      }
      return b;
    };

    // 1. Seed from JSON floors (carry geometry + already-serialized elements).
    for (const jf of rawJsonFloors) {
      const b = bucketFor(levelKey(jf));
      if (!b.base) b.base = { ...jf, elements: [] };
      if (!b.baseId && jf.id) {
        b.baseId = jf.id;
        b.base = { ...b.base, ...jf, id: jf.id, elements: [] };
      }
      for (const el of jf.elements || []) {
        if (el?.id) {
          if (!b.elements.has(el.id)) b.elements.set(el.id, el);
        } else {
          b.idlessElements.push(el);
        }
      }
    }

    // 2. Merge relational floors + their elements.
    for (const relFloor of relationalFloors) {
      const b = bucketFor(relFloor.level ?? 0);
      b.relFloors.push({ id: relFloor.id, count: relFloor.elements.length });
      if (!b.base) {
        b.base = {
          id: relFloor.id,
          name: relFloor.name,
          level: relFloor.level ?? 0,
          width: relFloor.width ?? 800,
          height: relFloor.height ?? 600,
          length: relFloor.length ?? 100,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
          hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
        };
      }

      // Inject any relational element not yet present (deduped by id across both sources)
      for (const el of relFloor.elements) {
        if (b.elements.has(el.id)) continue;
        const attrs = el.attributes as any;
        b.elements.set(el.id, {
          id: el.id,
          name: el.name,
          type: attrs?.originalType ?? this.reverseMapElementType(el.type),
          x: el.x ?? 0,
          y: el.y ?? 0,
          width: el.width ?? 80,
          height: el.height ?? 60,
          depth: el.depth ?? 60,
          height3d: el.height3d ?? 25,
          rotation: el.rotation ?? 0,
          capacity: el.capacity ?? null,
          image: el.image ?? null,
          notes: el.notes ?? null,
          shopType: (el as any).shopTypes ?? [],
          storageType: (el as any).storageTypes ?? [],
          hospitalityType: (el as any).hospitalityTypes ?? [],
          accessType: (el as any).accessTypes ?? [],
          entertainmentType: (el as any).entertainmentTypes ?? [],
          entranceType: (el as any).entranceTypes ?? [],
          kitchenType: (el as any).kitchenTypes ?? [],
          attributes: attrs ?? {},
          cornerRadius: {
            topLeft: el.cornerRadiusTL ?? 0,
            topRight: el.cornerRadiusTR ?? 0,
            bottomLeft: el.cornerRadiusBL ?? 0,
            bottomRight: el.cornerRadiusBR ?? 0,
          },
        });
      }
    }

    // 3. Emit one floor per level. Canonical id = the relational floor that actually
    //    holds the most elements (so the next builder Save collapses the duplicate
    //    relational rows into it), else a real JSON id, else any relational id.
    const mergedFloors = [...byLevel.values()]
      .filter((b) => b.base)
      .map((b) => {
        const bestRel = [...b.relFloors].sort((a, c) => c.count - a.count)[0];
        const id =
          bestRel && bestRel.count > 0
            ? bestRel.id
            : b.baseId ?? bestRel?.id ?? b.base.id;
        return { ...b.base, id, elements: [...b.elements.values(), ...b.idlessElements] };
      });

    return {
      id: config.id,
      name: config.name,
      spaceId: config.spaceId,
      capacity: config.capacity,
      isSystem: (config as any).isSystem ?? false,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      space: config.space,
      data: {
        floors: mergedFloors,
        forecourt: jsonData?.forecourt || null,
        externalMerch: jsonData?.externalMerch || null,
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
        externalMerch: { include: { config: { include: { space: true } } } },
      },
    });

    if (!element) {
      throw new NotFoundException(`SpaceElement ${elementId} not found`);
    }

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space;
    if (!space || space.tenantId !== tenantId) {
      throw new ForbiddenException(`SpaceElement ${elementId} does not belong to tenant`);
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
   * Résout la configuration cible des opérations d'assignation (quick-element, assign-floor,
   * forecourt, externalMerch) de l'étape 2 de l'intégration.
   *
   * Contrat STRICT (aucune création de config par défaut / « Weezevent Import », jamais) :
   *  1. `configId` explicite (config choisie au sélecteur d'étage / 3D Builder) → utilisée.
   *  2. Sinon, la config UTILISATEUR principale (la plus ancienne `isSystem = false`),
   *     c.-à-d. celle créée à l'étape 1 ou dans le 3D Builder.
   *  3. Sinon → erreur 400. On NE crée RIEN : pas de config « Weezevent Import », pas de
   *     config par défaut. L'utilisateur doit d'abord créer une config (étape 1 / 3D Builder).
   */
  private async resolveTargetConfig(spaceId: string, configId?: string) {
    if (configId) {
      const explicit = await this.prisma.config.findFirst({
        where: { id: configId, spaceId, isSystem: false },
      });
      if (explicit) return explicit;
    }

    const userConfig = await this.prisma.config.findFirst({
      where: { spaceId, isSystem: false },
      orderBy: { createdAt: 'asc' },
    });
    if (userConfig) return userConfig;

    throw new BadRequestException(
      "Aucune configuration pour cet espace. Créez-en une à l'étape 1 ou dans le 3D Builder " +
        "avant d'assigner ou de créer des shops. (Aucune configuration « Weezevent Import » n'est créée.)",
    );
  }

  /**
   * Position en grille (en mètres) pour le `index`-ième shop d'une zone, afin d'éviter
   * que tous les shops importés s'empilent à l'origine. Pas de 10 m, en partant de (5,5).
   */
  private gridPosition(index: number, areaWidth = 200): { x: number; y: number } {
    const STEP = 10;
    const MARGIN = 5;
    const cols = Math.max(1, Math.floor((areaWidth - MARGIN) / STEP));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: MARGIN + col * STEP, y: MARGIN + row * STEP };
  }

  /**
   * A21 — Read-modify-write de `config.data` avec verrou optimiste (champ `version`).
   * `mutate` reçoit le `data` JSON courant (relu à chaque tentative) et retourne le nouveau `data`.
   * L'écriture n'aboutit que si `version` n'a pas changé entre la lecture et l'écriture ;
   * sinon on relit et on ré-applique `mutate` (jusqu'à `maxRetries`). À la dernière tentative,
   * écriture inconditionnelle (last-write-wins) pour ne jamais perdre la mutation.
   */
  private async updateConfigDataOptimistic(
    configId: string,
    mutate: (currentData: any) => any | Promise<any>,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const fresh = await this.prisma.config.findFirst({
        where: { id: configId },
        select: { data: true, version: true },
      });
      if (!fresh) throw new NotFoundException(`Configuration ${configId} not found`);

      const newData = await mutate((fresh.data as any) || {});
      const isLastAttempt = attempt === maxRetries;

      const res = await this.prisma.config.updateMany({
        // Dernière tentative : on retombe sur un update inconditionnel (last-write-wins).
        where: isLastAttempt ? { id: configId } : { id: configId, version: fresh.version },
        data: { data: newData, version: { increment: 1 } },
      });
      if (res.count >= 1) return;
      // Conflit concurrent (version a changé) → on retente.
    }
  }

  /**
   * Quick-create a SpaceElement (shop) for a space without needing the floor plan editor.
   * Le shop est créé dans la configuration UTILISATEUR de l'espace (étape 1 / 3D Builder),
   * résolue par `resolveTargetConfig` — plus de config auto-générée « Weezevent Import »
   * tant qu'une config utilisateur existe.
   */
  async quickCreateElement(spaceId: string, tenantId: string, dto: { name: string; type?: string }) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Cible : la configuration utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.resolveTargetConfig(spaceId, (dto as any).configId);

    // Find or create a default floor in that config
    let floor = await this.prisma.floor.findFirst({
      where: { configId: config.id },
      orderBy: { level: 'asc' },
    });
    if (!floor) {
      // Une config utilisateur a normalement déjà un RDC ; ce repli ne sert que si elle
      // est vide. On NE crée JAMAIS de floor « Import » — un RDC neutre (level 0).
      floor = await this.prisma.floor.create({
        data: { configId: config.id, name: 'RDC', level: 0, width: 100, height: 4, length: 100 },
      });
    }

    const elementType = this.mapElementType(dto.type || 'shop');
    const shopTypeTags = this.mapShopTypeTags(dto.type);

    // Position en grille pour ne pas empiler tous les shops à l'origine (0,0) maintenant
    // qu'ils atterrissent dans la config utilisateur (visibles dans le 3D Builder).
    const existingCount = await this.prisma.spaceElement.count({ where: { floorId: floor.id } });
    const { x: gridX, y: gridY } = this.gridPosition(existingCount, floor.width ?? 200);

    const element = await this.prisma.spaceElement.create({
      data: {
        floorId: floor.id,
        name: dto.name,
        type: elementType,
        x: gridX,
        y: gridY,
        width: 2,
        height: 2,
        depth: 2,
        shopTypes: shopTypeTags,
        storageTypes: [],
        hospitalityTypes: [],
        accessTypes: [],
        entertainmentTypes: [],
        entranceTypes: [],
        kitchenTypes: [],
        attributes: { originalType: dto.type || 'shop', importedFromWeezevent: true },
      } as any,
    });

    // Sync config.data JSON so the Space Builder reads the new element without a full re-save.
    // getConfiguration() reads config.data exclusively — the relational rows are not enough.
    await this.updateConfigDataOptimistic(config.id, (currentData) => {
      const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];
      let jsonFloor = jsonFloors.find((f: any) => f.id === floor.id);
      if (!jsonFloor) {
        jsonFloor = {
          id: floor.id,
          name: floor.name,
          level: floor.level ?? 0,
          width: floor.width ?? 200,
          height: floor.height ?? 4,
          length: floor.length ?? 200,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
          hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
        };
        jsonFloors.push(jsonFloor);
      }
      if (!Array.isArray(jsonFloor.elements)) jsonFloor.elements = [];
      // Idempotence : ne pas dupliquer l'élément s'il est déjà présent (retry / réécriture).
      if (!jsonFloor.elements.find((e: any) => e.id === element.id)) {
        jsonFloor.elements.push({
          id: element.id,
          name: element.name,
          type: dto.type || 'shop',
          x: gridX,
          y: gridY,
          width: 2,
          height: 2,
          depth: 2,
          shopType: shopTypeTags,
          storageType: [],
          hospitalityType: [],
          accessType: [],
          entertainmentType: [],
          entranceType: [],
          kitchenType: [],
          attributes: { originalType: dto.type || 'shop', importedFromWeezevent: true },
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        });
      }
      return { ...currentData, floors: jsonFloors };
    });

    // Invalidate Redis cache so Space Builder fetches fresh config list on next load
    await this.invalidateSpaceCache(space.tenantId, spaceId);

    return {
      id: element.id,
      name: element.name,
      type: dto.type || 'shop',
      configName: config.name,
      areaName: floor.name,
    };
  }

  /**
   * Assign a list of SpaceElements to a given floor level (or to the forecourt/"Parvis")
   * within the same space. Le Floor/Forecourt est trouvé/créé dans la configuration cible
   * (`opts.configId`, sinon la config utilisateur principale via `resolveTargetConfig`).
   */
  async assignElementsToFloorLevel(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    level: number | 'forecourt' | 'externalmerch',
    opts: { configId?: string; width?: number; length?: number; height?: number } = {},
  ) {
    if (level === 'forecourt') {
      return this.assignElementsToForecourt(spaceId, tenantId, elementIds, opts);
    }
    if (level === 'externalmerch') {
      return this.assignElementsToExternalMerch(spaceId, tenantId, elementIds, opts);
    }
    // Garde défensive : tout `level` non géré ci-dessus doit être un entier (RDC=0,
    // étages positifs, sous-sols négatifs). Le DTO valide déjà ce contrat — cette garde
    // évite un 500 Prisma (`level` Int) si l'endpoint est appelé hors validation.
    if (typeof level !== 'number' || !Number.isInteger(level)) {
      throw new BadRequestException(`level invalide: ${String(level)} (entier, 'forecourt' ou 'externalmerch' attendu)`);
    }

    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Resolve floor name from level
    let floorName: string;
    if (level === 0) floorName = 'RDC';
    else if (level < 0) floorName = `Sous-sol ${Math.abs(level)}`;
    else floorName = `Étage ${level}`;

    // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.resolveTargetConfig(spaceId, opts.configId);

    // Find or create the Floor at this level
    let floor = await this.prisma.floor.findFirst({
      where: { configId: config.id, level },
    });
    if (!floor) {
      floor = await this.prisma.floor.create({
        data: {
          configId: config.id,
          name: floorName,
          level,
          width: opts.width ?? 200,
          height: opts.height ?? 4,
          length: opts.length ?? 200,
        },
      });
    }

    // Verify all elements belong to this tenant's space, then move them to the floor
    const updated: string[] = [];
    // Track which source floors lost elements (for JSON sync)
    const movedElements: Array<{ id: string; sourceFloorId: string | null }> = [];

    for (const elementId of elementIds) {
      const element = await this.prisma.spaceElement.findFirst({
        where: { id: elementId },
        include: {
          floor: { include: { config: { include: { space: true } } } },
          forecourt: { include: { config: { include: { space: true } } } },
          externalMerch: { include: { config: { include: { space: true } } } },
        },
      });
      if (!element) continue;
      const elemSpace = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space;
      if (!elemSpace || elemSpace.tenantId !== tenantId || elemSpace.id !== spaceId) continue;

      movedElements.push({ id: element.id, sourceFloorId: element.floorId ?? null });

      await this.prisma.spaceElement.update({
        where: { id: elementId },
        data: { floorId: floor.id, forecourtId: null, externalMerchId: null },
      });
      updated.push(elementId);
    }

    // Sync config.data JSON: move elements from their source floor to the target floor
    if (updated.length > 0) {
      await this.updateConfigDataOptimistic(config.id, async (currentData) => {
        const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];

        // Remove moved elements from their source floors in the JSON
        const movedIds = new Set(updated);
        for (const jsonFloorEntry of jsonFloors) {
          if (Array.isArray(jsonFloorEntry.elements)) {
            jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
          }
        }

        // Ensure the target floor entry exists in JSON
        let targetJsonFloor = jsonFloors.find((f: any) => f.id === floor.id);
        if (!targetJsonFloor) {
          targetJsonFloor = {
            id: floor.id,
            name: floor.name,
            level: floor.level ?? level,
            width: floor.width ?? 200,
            height: floor.height ?? 4,
            length: floor.length ?? 200,
            elements: [],
            cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            hole: { enabled: false, x: 0.5, y: 0.5, width: 10, length: 10, cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 } },
          };
          jsonFloors.push(targetJsonFloor);
        }
        if (!Array.isArray(targetJsonFloor.elements)) targetJsonFloor.elements = [];

        // Find element JSON entries from all floors (they were in JSON after quickCreateElement)
        const allElements: any[] = [];
        for (const jf of jsonFloors) {
          if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
        }

        for (const movedEl of movedElements) {
          if (!updated.includes(movedEl.id)) continue;
          // Reuse the existing JSON representation if available, otherwise create a minimal stub
          const existing = allElements.find((e: any) => e.id === movedEl.id);
          if (existing && !targetJsonFloor.elements.find((e: any) => e.id === movedEl.id)) {
            targetJsonFloor.elements.push(existing);
          } else if (!existing) {
            const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
            if (relElement) {
              const attrs = relElement.attributes as any;
              targetJsonFloor.elements.push({
                id: relElement.id,
                name: relElement.name,
                type: attrs?.originalType ?? 'shop',
                x: relElement.x ?? 0,
                y: relElement.y ?? 0,
                width: relElement.width ?? 2,
                height: relElement.height ?? 2,
                depth: relElement.depth ?? 2,
                shopType: (relElement as any).shopTypes ?? [],
                storageType: (relElement as any).storageTypes ?? [],
                hospitalityType: (relElement as any).hospitalityTypes ?? [],
                accessType: (relElement as any).accessTypes ?? [],
                entertainmentType: (relElement as any).entertainmentTypes ?? [],
                entranceType: (relElement as any).entranceTypes ?? [],
                kitchenType: (relElement as any).kitchenTypes ?? [],
                attributes: attrs ?? {},
                cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
              });
            }
          }
        }

        // Remove empty source floors from JSON to keep it clean
        const cleanedJsonFloors = jsonFloors.filter(
          (f: any) => f.id === floor.id || (Array.isArray(f.elements) && f.elements.length > 0),
        );

        return { ...currentData, floors: cleanedJsonFloors };
      });

      await this.invalidateSpaceCache(tenantId, spaceId);
    }

    // Réponse en union discriminée (`kind`) cohérente entre floor / forecourt / externalmerch.
    return { kind: 'floor' as const, floorId: floor.id, floorName, level, updatedElementIds: updated };
  }

  /**
   * Assign a list of SpaceElements to the forecourt ("Parvis") of the element's
   * "Weezevent Import" config. Finds or creates the Forecourt if needed.
   */
  private async assignElementsToForecourt(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    opts: { configId?: string; width?: number; length?: number } = {},
  ) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.resolveTargetConfig(spaceId, opts.configId);

    // Find or create the Forecourt for this config
    let forecourt = await this.prisma.forecourt.findUnique({
      where: { configId: config.id },
    });
    if (!forecourt) {
      forecourt = await this.prisma.forecourt.create({
        data: { configId: config.id, name: 'Parvis', width: opts.width ?? 200, length: opts.length ?? 200 },
      });
    }

    // Verify all elements belong to this tenant's space, then move them to the forecourt
    const updated: string[] = [];
    const movedElements: { id: string }[] = [];

    for (const elementId of elementIds) {
      const element = await this.prisma.spaceElement.findFirst({
        where: { id: elementId },
        include: {
          floor: { include: { config: { include: { space: true } } } },
          forecourt: { include: { config: { include: { space: true } } } },
          externalMerch: { include: { config: { include: { space: true } } } },
        },
      });
      if (!element) continue;
      const elemSpace = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space;
      if (!elemSpace || elemSpace.tenantId !== tenantId || elemSpace.id !== spaceId) continue;

      movedElements.push({ id: element.id });

      await this.prisma.spaceElement.update({
        where: { id: elementId },
        data: { floorId: null, forecourtId: forecourt.id, externalMerchId: null },
      });
      updated.push(elementId);
    }

    // Sync config.data JSON: move elements from their source floor(s) to the forecourt
    if (updated.length > 0) {
      await this.updateConfigDataOptimistic(config.id, async (currentData) => {
      const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];
      const movedIds = new Set(updated);

      // Collect existing JSON entries for moved elements (to preserve dimensions/types)
      const allElements: any[] = [];
      for (const jf of jsonFloors) {
        if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
      }

      // Remove moved elements from their source floors in the JSON
      for (const jsonFloorEntry of jsonFloors) {
        if (Array.isArray(jsonFloorEntry.elements)) {
          jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
        }
      }

      // Ensure the forecourt entry exists in JSON
      let jsonForecourt = currentData.forecourt;
      if (!jsonForecourt) {
        jsonForecourt = {
          id: forecourt.id,
          name: forecourt.name,
          width: forecourt.width ?? 200,
          length: forecourt.length ?? 200,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        };
      }
      if (!Array.isArray(jsonForecourt.elements)) jsonForecourt.elements = [];

      for (const movedEl of movedElements) {
        if (jsonForecourt.elements.find((e: any) => e.id === movedEl.id)) continue;
        const existing = allElements.find((e: any) => e.id === movedEl.id);
        if (existing) {
          jsonForecourt.elements.push(existing);
        } else {
          const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
          if (relElement) {
            const attrs = relElement.attributes as any;
            jsonForecourt.elements.push({
              id: relElement.id,
              name: relElement.name,
              type: attrs?.originalType ?? 'shop',
              x: relElement.x ?? 0,
              y: relElement.y ?? 0,
              width: relElement.width ?? 2,
              height: relElement.height ?? 2,
              depth: relElement.depth ?? 2,
              shopType: (relElement as any).shopTypes ?? [],
              storageType: (relElement as any).storageTypes ?? [],
              hospitalityType: (relElement as any).hospitalityTypes ?? [],
              accessType: (relElement as any).accessTypes ?? [],
              entertainmentType: (relElement as any).entertainmentTypes ?? [],
              entranceType: (relElement as any).entranceTypes ?? [],
              kitchenType: (relElement as any).kitchenTypes ?? [],
              attributes: attrs ?? {},
              cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            });
          }
        }
      }

      // Remove now-empty source floors from JSON to keep it clean
      const cleanedJsonFloors = jsonFloors.filter(
        (f: any) => Array.isArray(f.elements) && f.elements.length > 0,
      );

        return { ...currentData, floors: cleanedJsonFloors, forecourt: jsonForecourt };
      });

      await this.invalidateSpaceCache(tenantId, spaceId);
    }

    return { kind: 'forecourt' as const, forecourtId: forecourt.id, forecourtName: forecourt.name, level: null, updatedElementIds: updated };
  }

  /**
   * Assign a list of SpaceElements to the "External Merch" zone of the element's
   * internal import config. Miroir de assignElementsToForecourt pour la zone externalMerch.
   */
  private async assignElementsToExternalMerch(
    spaceId: string,
    tenantId: string,
    elementIds: string[],
    opts: { configId?: string; width?: number; length?: number } = {},
  ) {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId } });
    if (!space) throw new NotFoundException('Space not found or access denied');

    // Cible : la config utilisateur (étape 1 / 3D Builder), pas « Weezevent Import ».
    const config = await this.resolveTargetConfig(spaceId, opts.configId);

    // Find or create the ExternalMerch zone for this config
    let externalMerch = await this.prisma.externalMerch.findUnique({
      where: { configId: config.id },
    });
    if (!externalMerch) {
      externalMerch = await this.prisma.externalMerch.create({
        data: { configId: config.id, name: 'Espace Externe', width: opts.width ?? 200, length: opts.length ?? 200 },
      });
    }

    // Verify all elements belong to this tenant's space, then move them to the external merch zone
    const updated: string[] = [];
    const movedElements: { id: string }[] = [];

    for (const elementId of elementIds) {
      const element = await this.prisma.spaceElement.findFirst({
        where: { id: elementId },
        include: {
          floor: { include: { config: { include: { space: true } } } },
          forecourt: { include: { config: { include: { space: true } } } },
          externalMerch: { include: { config: { include: { space: true } } } },
        },
      });
      if (!element) continue;
      const elemSpace = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space;
      if (!elemSpace || elemSpace.tenantId !== tenantId || elemSpace.id !== spaceId) continue;

      movedElements.push({ id: element.id });

      await this.prisma.spaceElement.update({
        where: { id: elementId },
        data: { floorId: null, forecourtId: null, externalMerchId: externalMerch.id },
      });
      updated.push(elementId);
    }

    // Sync config.data JSON: move elements from their source zone(s) to externalMerch
    if (updated.length > 0) {
      await this.updateConfigDataOptimistic(config.id, async (currentData) => {
      const jsonFloors: any[] = Array.isArray(currentData.floors) ? [...currentData.floors] : [];
      const movedIds = new Set(updated);

      // Collect existing JSON entries for moved elements (to preserve dimensions/types)
      const allElements: any[] = [];
      for (const jf of jsonFloors) {
        if (Array.isArray(jf.elements)) allElements.push(...jf.elements);
      }
      if (Array.isArray(currentData.forecourt?.elements)) allElements.push(...currentData.forecourt.elements);

      // Remove moved elements from their source floors / forecourt in the JSON
      for (const jsonFloorEntry of jsonFloors) {
        if (Array.isArray(jsonFloorEntry.elements)) {
          jsonFloorEntry.elements = jsonFloorEntry.elements.filter((e: any) => !movedIds.has(e.id));
        }
      }
      const jsonForecourt = currentData.forecourt
        ? { ...currentData.forecourt, elements: (currentData.forecourt.elements || []).filter((e: any) => !movedIds.has(e.id)) }
        : currentData.forecourt ?? null;

      // Ensure the externalMerch entry exists in JSON
      let jsonExternalMerch = currentData.externalMerch;
      if (!jsonExternalMerch) {
        jsonExternalMerch = {
          id: externalMerch.id,
          name: externalMerch.name,
          width: externalMerch.width ?? 200,
          length: externalMerch.length ?? 200,
          elements: [],
          cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
        };
      }
      if (!Array.isArray(jsonExternalMerch.elements)) jsonExternalMerch.elements = [];

      for (const movedEl of movedElements) {
        if (jsonExternalMerch.elements.find((e: any) => e.id === movedEl.id)) continue;
        const existing = allElements.find((e: any) => e.id === movedEl.id);
        if (existing) {
          jsonExternalMerch.elements.push(existing);
        } else {
          const relElement = await this.prisma.spaceElement.findFirst({ where: { id: movedEl.id } });
          if (relElement) {
            const attrs = relElement.attributes as any;
            jsonExternalMerch.elements.push({
              id: relElement.id,
              name: relElement.name,
              type: attrs?.originalType ?? 'shop',
              x: relElement.x ?? 0,
              y: relElement.y ?? 0,
              width: relElement.width ?? 2,
              height: relElement.height ?? 2,
              depth: relElement.depth ?? 2,
              shopType: (relElement as any).shopTypes ?? [],
              storageType: (relElement as any).storageTypes ?? [],
              hospitalityType: (relElement as any).hospitalityTypes ?? [],
              accessType: (relElement as any).accessTypes ?? [],
              entertainmentType: (relElement as any).entertainmentTypes ?? [],
              entranceType: (relElement as any).entranceTypes ?? [],
              kitchenType: (relElement as any).kitchenTypes ?? [],
              attributes: attrs ?? {},
              cornerRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 },
            });
          }
        }
      }

      // Remove now-empty source floors from JSON to keep it clean
      const cleanedJsonFloors = jsonFloors.filter(
        (f: any) => Array.isArray(f.elements) && f.elements.length > 0,
      );

        return { ...currentData, floors: cleanedJsonFloors, forecourt: jsonForecourt, externalMerch: jsonExternalMerch };
      });

      await this.invalidateSpaceCache(tenantId, spaceId);
    }

    return { kind: 'externalmerch' as const, externalMerchId: externalMerch.id, externalMerchName: externalMerch.name, level: null, updatedElementIds: updated };
  }

  /**
   * Delete a SpaceElement (and its config.data JSON entry) if no
   * WeezeventLocationShopMapping still references it. Used when a Weezevent
   * shop mapping is removed in Data Integration so the corresponding 3D
   * builder element is removed too.
   */
  async deleteElementIfUnreferenced(elementId: string, tenantId: string): Promise<boolean> {
    const remainingMappings = await this.prisma.weezeventLocationShopMapping.count({
      where: { spaceElementId: elementId },
    });
    if (remainingMappings > 0) return false;

    const element = await this.prisma.spaceElement.findFirst({
      where: { id: elementId },
      include: {
        floor: { include: { config: { include: { space: true } } } },
        forecourt: { include: { config: { include: { space: true } } } },
        externalMerch: { include: { config: { include: { space: true } } } },
      },
    });
    if (!element) return false;

    const space = element.floor?.config?.space ?? element.forecourt?.config?.space ?? element.externalMerch?.config?.space;
    if (!space || space.tenantId !== tenantId) return false;

    const config = element.floor?.config ?? element.forecourt?.config ?? element.externalMerch?.config;
    if (!config) return false;

    await this.prisma.spaceElement.delete({ where: { id: elementId } });

    // Remove the element from config.data JSON (floors[].elements / forecourt.elements)
    const freshConfig = await this.prisma.config.findFirst({ where: { id: config.id } });
    const currentData = (freshConfig?.data as any) || {};
    let changed = false;

    const jsonFloors: any[] = Array.isArray(currentData.floors) ? currentData.floors : [];
    for (const jf of jsonFloors) {
      if (Array.isArray(jf.elements)) {
        const before = jf.elements.length;
        jf.elements = jf.elements.filter((e: any) => e.id !== elementId);
        if (jf.elements.length !== before) changed = true;
      }
    }

    const jsonForecourt = currentData.forecourt;
    if (jsonForecourt && Array.isArray(jsonForecourt.elements)) {
      const before = jsonForecourt.elements.length;
      jsonForecourt.elements = jsonForecourt.elements.filter((e: any) => e.id !== elementId);
      if (jsonForecourt.elements.length !== before) changed = true;
    }

    const jsonExternalMerch = currentData.externalMerch;
    if (jsonExternalMerch && Array.isArray(jsonExternalMerch.elements)) {
      const before = jsonExternalMerch.elements.length;
      jsonExternalMerch.elements = jsonExternalMerch.elements.filter((e: any) => e.id !== elementId);
      if (jsonExternalMerch.elements.length !== before) changed = true;
    }

    if (changed) {
      await this.prisma.config.update({
        where: { id: config.id },
        data: { data: { ...currentData, floors: jsonFloors, forecourt: jsonForecourt ?? null, externalMerch: jsonExternalMerch ?? null }, version: { increment: 1 } },
      });
    }

    await this.invalidateSpaceCache(tenantId, space.id);
    return true;
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
