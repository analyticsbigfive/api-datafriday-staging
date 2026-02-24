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
   * Create or update a configuration with normalized tables
   */
  async saveConfiguration(dto: any, tenantId: string) {
    // Verify space exists and belongs to tenant
    await this.findOne(dto.spaceId, tenantId);

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
          
          const createdElement = await tx.floorElement.create({
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
          
          const createdElement = await tx.forecourtElement.create({
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
              entranceTypes: element.entranceType || [],
              accessTypes: element.accessType || [],
              tags: element.tags || [],
              // Store original type in attributes
              attributes: { ...element.attributes, originalType },
            } as any,
          });

          // Create performance, staff, inventory for forecourt elements
          if (element.performance) {
            await tx.forecourtElementPerformance.create({
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
            await tx.forecourtElementStaff.createMany({
              data: element.staffPositions.map((pos: any) => ({
                elementId: createdElement.id,
                position: pos.position,
                count: pos.count || 1,
              })),
            });
          }

          if (element.inventoryItems && element.inventoryItems.length > 0) {
            await tx.forecourtElementInventory.createMany({
              data: element.inventoryItems.map((item: any) => ({
                elementId: createdElement.id,
                name: item.name,
                quantity: item.quantity || 0,
                isCustom: true,
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
    const config = await this.prisma.config.findUnique({
      where: { id: configId },
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

    // Verify the configuration's space belongs to the tenant
    if (config.space.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied to this configuration');
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
   * Transform a forecourt element from DB to frontend format
   */
  private transformForecourtElement(element: any) {
    // Use originalType from attributes if available
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
      entranceType: element.entranceTypes,
      accessType: element.accessTypes,
      tags: element.tags,
      attributes: element.attributes,
      performance: element.performance
        ? {
            revenue: element.performance.revenue,
            numberOfPOS: element.performance.numberOfPOS,
            numberOfTransactions: element.performance.numberOfTransactions,
            transactionsPerMinute: element.performance.transactionsPerMinute,
            staffCost: element.performance.staffCost,
            revenuePerEmployee: element.performance.revenuePerEmployee,
          }
        : null,
      staffPositions: element.staffPositions?.map((s: any) => ({
        id: s.id,
        position: s.position,
        count: s.count,
      })) || [],
      inventoryItems: element.inventoryItems?.map((i: any) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        isCustom: i.isCustom,
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
