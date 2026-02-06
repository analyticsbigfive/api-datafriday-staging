import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateSpaceDto } from './dto/create-space.dto';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { QuerySpaceDto } from './dto/query-space.dto';
import { nanoid } from 'nanoid';

@Injectable()
export class SpacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new space for a tenant
   */
  async create(tenantId: string, dto: CreateSpaceDto) {
    const space = await this.prisma.space.create({
      data: {
        id: `space-${nanoid(10)}`,
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
        include: {
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
      include: {
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
            capacity: true,
            createdAt: true,
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
   * Get configurations for a space
   */
  async getConfigurations(spaceId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    const configurations = await this.prisma.config.findMany({
      where: {
        spaceId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
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
   * TODO: Implement based on your actual sales/shop data structure
   * For now, returns empty array as placeholder
   */
  async getShopDetails(spaceId: string, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(spaceId, tenantId);

    // TODO: Query your actual shop/sales data tables
    // Example structure (adapt to your schema):
    // const shopDetails = await this.prisma.shopSales.findMany({
    //   where: { spaceId },
    //   include: {
    //     shop: true,
    //     event: true,
    //   },
    // });

    // Placeholder: Return empty array until sales tables are implemented
    return [];
  }

  /**
   * Create or update a configuration
   */
  async saveConfiguration(dto: any, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(dto.spaceId, tenantId);

    // Generate ID if not provided
    const configId = dto.id || `config-${Date.now()}`;

    // Check if configuration already exists
    const existing = await this.prisma.config.findUnique({
      where: { id: configId },
    });

    if (existing) {
      // Update existing configuration
      return await this.prisma.config.update({
        where: { id: configId },
        data: {
          name: dto.name,
          capacity: dto.capacity,
          data: dto.data,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new configuration
      return await this.prisma.config.create({
        data: {
          id: configId,
          name: dto.name,
          spaceId: dto.spaceId,
          capacity: dto.capacity,
          data: dto.data,
        },
      });
    }
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
   */
  async getConfiguration(configId: string, tenantId: string) {
    const config = await this.prisma.config.findUnique({
      where: { id: configId },
      include: {
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

    // Verify the configuration's space belongs to the tenant
    if (config.space.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied to this configuration');
    }

    return config;
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
