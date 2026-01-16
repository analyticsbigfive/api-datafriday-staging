import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { UpgradePlanDto } from './dto/upgrade-plan.dto';
import { TenantPlan, TenantStatus, Prisma } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    name: true,
    slug: true,
    domain: true,
    logo: true,
    plan: true,
    status: true,
    organizationType: true,
    siret: true,
    address: true,
    city: true,
    postalCode: true,
    country: true,
    email: true,
    phone: true,
    numberOfEmployees: true,
    numberOfSpaces: true,
    paymentMethod: true,
    // Weezevent Integration
    weezeventEnabled: true,
    weezeventOrganizationId: true,
    weezeventClientId: true,
    weezeventClientSecret: true, // Attention: sera retourné chiffré
    createdAt: true,
    updatedAt: true,
  };

  /**
   * Create a new tenant
   */
  async create(dto: CreateTenantDto) {
    // Check if slug already exists
    const existingSlug = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (existingSlug) {
      throw new ConflictException(`Tenant with slug '${dto.slug}' already exists`);
    }

    // Check if domain already exists (if provided)
    if (dto.domain) {
      const existingDomain = await this.prisma.tenant.findUnique({
        where: { domain: dto.domain },
      });

      if (existingDomain) {
        throw new ConflictException(`Tenant with domain '${dto.domain}' already exists`);
      }
    }

    return this.prisma.tenant.create({
      data: {
        ...dto,
        plan: dto.plan || TenantPlan.FREE,
        status: TenantStatus.ACTIVE,
      },
      select: this.selectFields,
    });
  }

  /**
   * Find all tenants with pagination and filters
   */
  async findAll(query: QueryTenantDto) {
    const { search, plan, status, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: Prisma.TenantWhereInput = {};

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Plan filter
    if (plan) {
      where.plan = plan;
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    const skip = (page - 1) * limit;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        select: this.selectFields,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: tenants,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Find tenant by ID
   */
  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        ...this.selectFields,
        _count: {
          select: {
            users: true,
            spaces: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    return tenant;
  }

  /**
   * Find tenant by slug
   */
  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: this.selectFields,
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug '${slug}' not found`);
    }

    return tenant;
  }

  /**
   * Update tenant
   */
  async update(id: string, dto: UpdateTenantDto) {
    // Verify tenant exists
    await this.findOne(id);

    // Check slug uniqueness if updating
    if (dto.slug) {
      const existingSlug = await this.prisma.tenant.findFirst({
        where: {
          slug: dto.slug,
          NOT: { id },
        },
      });

      if (existingSlug) {
        throw new ConflictException(`Tenant with slug '${dto.slug}' already exists`);
      }
    }

    // Check domain uniqueness if updating
    if (dto.domain) {
      const existingDomain = await this.prisma.tenant.findFirst({
        where: {
          domain: dto.domain,
          NOT: { id },
        },
      });

      if (existingDomain) {
        throw new ConflictException(`Tenant with domain '${dto.domain}' already exists`);
      }
    }

    return this.prisma.tenant.update({
      where: { id },
      data: dto,
      select: this.selectFields,
    });
  }

  /**
   * Delete tenant (soft delete - sets status to CANCELLED)
   */
  async remove(id: string) {
    // Verify tenant exists
    const tenant = await this.findOne(id);

    if (tenant.status === TenantStatus.CANCELLED) {
      throw new ConflictException('Tenant is already cancelled');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        status: TenantStatus.CANCELLED,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Hard delete tenant (permanent deletion)
   */
  async hardDelete(id: string) {
    // Verify tenant exists
    await this.findOne(id);

    await this.prisma.tenant.delete({
      where: { id },
    });

    return { success: true, message: `Tenant '${id}' permanently deleted` };
  }

  /**
   * Upgrade tenant plan
   */
  async upgradePlan(id: string, dto: UpgradePlanDto) {
    const tenant = await this.findOne(id);

    const planHierarchy: Record<TenantPlan, number> = {
      [TenantPlan.FREE]: 0,
      [TenantPlan.STARTER]: 1,
      [TenantPlan.PROFESSIONAL]: 2,
      [TenantPlan.ENTERPRISE]: 3,
    };

    // Prevent downgrade through this endpoint
    if (planHierarchy[dto.plan] < planHierarchy[tenant.plan]) {
      throw new ForbiddenException(
        `Cannot downgrade from ${tenant.plan} to ${dto.plan}. Use the downgrade endpoint instead.`,
      );
    }

    if (planHierarchy[dto.plan] === planHierarchy[tenant.plan]) {
      throw new ConflictException(`Tenant is already on ${dto.plan} plan`);
    }

    const updateData: Prisma.TenantUpdateInput = {
      plan: dto.plan,
    };

    if (dto.paymentMethod) {
      updateData.paymentMethod = dto.paymentMethod;
    }

    if (dto.billingEmail) {
      updateData.email = dto.billingEmail;
    }

    return this.prisma.tenant.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        paymentMethod: true,
        email: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get tenant usage statistics
   */
  async getUsage(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        plan: true,
        _count: {
          select: {
            users: true,
            spaces: true,
            weezeventEvents: true,
            weezeventTransactions: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID '${id}' not found`);
    }

    // Define plan limits
    const planLimits: Record<TenantPlan, { users: number; spaces: number }> = {
      [TenantPlan.FREE]: { users: 3, spaces: 1 },
      [TenantPlan.STARTER]: { users: 10, spaces: 5 },
      [TenantPlan.PROFESSIONAL]: { users: 50, spaces: 20 },
      [TenantPlan.ENTERPRISE]: { users: -1, spaces: -1 }, // Unlimited
    };

    const limits = planLimits[tenant.plan];

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
      },
      usage: {
        users: {
          current: tenant._count.users,
          limit: limits.users,
          percentage: limits.users === -1 ? 0 : Math.round((tenant._count.users / limits.users) * 100),
        },
        spaces: {
          current: tenant._count.spaces,
          limit: limits.spaces,
          percentage: limits.spaces === -1 ? 0 : Math.round((tenant._count.spaces / limits.spaces) * 100),
        },
        weezeventEvents: tenant._count.weezeventEvents,
        weezeventTransactions: tenant._count.weezeventTransactions,
      },
    };
  }

  /**
   * Suspend tenant
   */
  async suspend(id: string) {
    const tenant = await this.findOne(id);

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new ConflictException('Tenant is already suspended');
    }

    if (tenant.status === TenantStatus.CANCELLED) {
      throw new ConflictException('Cannot suspend a cancelled tenant');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.SUSPENDED },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Reactivate tenant
   */
  async reactivate(id: string) {
    const tenant = await this.findOne(id);

    if (tenant.status === TenantStatus.ACTIVE) {
      throw new ConflictException('Tenant is already active');
    }

    if (tenant.status === TenantStatus.CANCELLED) {
      throw new ConflictException('Cannot reactivate a cancelled tenant. Create a new tenant instead.');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get tenant statistics (for admin dashboard)
   */
  async getStatistics() {
    const [totalTenants, byPlan, byStatus, recentTenants] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),
      this.prisma.tenant.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.tenant.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      total: totalTenants,
      byPlan: byPlan.reduce(
        (acc, item) => {
          acc[item.plan] = item._count.plan;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        },
        {} as Record<string, number>,
      ),
      recentTenants,
    };
  }
}
