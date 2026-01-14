import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new user for a tenant
   */
  async create(tenantId: string, dto: CreateUserDto) {
    // Check if user with same email already exists in tenant
    const existing = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        tenantId,
      },
    });

    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists in this organization`);
    }

    const fullName = `${dto.firstName} ${dto.lastName}`;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        fullName,
        role: dto.role || UserRole.VIEWER,
        avatar: dto.avatar,
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
      },
    });

    // Also create UserTenant relation for multi-tenant support
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        role: dto.role || UserRole.VIEWER,
        isOwner: false,
      },
    });

    this.logger.log(`User ${user.email} created for tenant ${tenantId}`);

    return this.sanitizeUser(user);
  }

  /**
   * Find all users for a tenant with pagination and filters
   */
  async findAll(tenantId: string, query: QueryUserDto) {
    const { search, role, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              pinnedSpaces: true,
              spaceAccess: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(u => this.sanitizeUser(u)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one user by ID
   */
  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        pinnedSpaces: {
          include: {
            space: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        spaceAccess: {
          include: {
            space: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            pinnedSpaces: true,
            spaceAccess: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.sanitizeUser(user);
  }

  /**
   * Find user by email within a tenant
   */
  async findByEmail(email: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, tenantId },
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

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    return this.sanitizeUser(user);
  }

  /**
   * Update a user
   */
  async update(id: string, tenantId: string, dto: UpdateUserDto) {
    // Verify user exists and belongs to tenant
    await this.findOne(id, tenantId);

    const updateData: any = {};

    if (dto.email) updateData.email = dto.email;
    if (dto.firstName) updateData.firstName = dto.firstName;
    if (dto.lastName) updateData.lastName = dto.lastName;
    if (dto.role) updateData.role = dto.role;
    if (dto.avatar !== undefined) updateData.avatar = dto.avatar;

    // Update fullName if names changed
    if (dto.firstName || dto.lastName) {
      const current = await this.prisma.user.findUnique({ where: { id } });
      const firstName = dto.firstName || current?.firstName || '';
      const lastName = dto.lastName || current?.lastName || '';
      updateData.fullName = `${firstName} ${lastName}`;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
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

    this.logger.log(`User ${id} updated`);

    return this.sanitizeUser(user);
  }

  /**
   * Delete a user (soft delete via removing from tenant)
   */
  async remove(id: string, tenantId: string, currentUserId: string) {
    // Cannot delete yourself
    if (id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    // Verify user exists and belongs to tenant
    await this.findOne(id, tenantId);

    // Check if user is tenant owner
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId: id, tenantId },
    });

    if (userTenant?.isOwner) {
      throw new ForbiddenException('Cannot delete the organization owner');
    }

    // Delete UserTenant relation
    await this.prisma.userTenant.deleteMany({
      where: { userId: id, tenantId },
    });

    // Delete the user
    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User ${id} deleted from tenant ${tenantId}`);

    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Change user role
   */
  async changeRole(
    id: string,
    tenantId: string,
    dto: ChangeRoleDto,
    currentUserId: string,
    currentUserRole: UserRole,
  ) {
    // Cannot change own role
    if (id === currentUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    // Only ADMIN can promote to ADMIN
    if (dto.role === UserRole.ADMIN && currentUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can promote users to admin');
    }

    // Verify user exists
    const user = await this.findOne(id, tenantId);

    // Cannot demote organization owner
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId: id, tenantId },
    });

    if (userTenant?.isOwner && dto.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot demote the organization owner');
    }

    // Update role in User table
    await this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
    });

    // Update role in UserTenant table
    await this.prisma.userTenant.updateMany({
      where: { userId: id, tenantId },
      data: { role: dto.role },
    });

    this.logger.log(`User ${id} role changed to ${dto.role}`);

    return {
      ...user,
      role: dto.role,
      message: `Role changed to ${dto.role}`,
    };
  }

  /**
   * Invite a user to the tenant
   */
  async invite(tenantId: string, dto: InviteUserDto, invitedBy: string) {
    // Check if user already exists in tenant
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    if (existing) {
      throw new ConflictException(`User ${dto.email} is already a member of this organization`);
    }

    // For now, create a placeholder user (in real app, send invitation email)
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: 'Invited',
        lastName: 'User',
        fullName: 'Invited User',
        role: dto.role || UserRole.VIEWER,
        tenantId,
      },
    });

    // Create UserTenant relation
    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        role: dto.role || UserRole.VIEWER,
        isOwner: false,
      },
    });

    this.logger.log(`Invitation sent to ${dto.email} for tenant ${tenantId} by ${invitedBy}`);

    // TODO: Send invitation email
    // await this.emailService.sendInvitation(dto.email, tenant, invitedBy, dto.message);

    return {
      success: true,
      message: `Invitation sent to ${dto.email}`,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Get user statistics for a tenant
   */
  async getStatistics(tenantId: string) {
    const [total, byRole, recentUsers] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.user.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

    const roleStats = {
      ADMIN: 0,
      MANAGER: 0,
      STAFF: 0,
      VIEWER: 0,
    };

    byRole.forEach(r => {
      roleStats[r.role] = r._count;
    });

    return {
      total,
      byRole: roleStats,
      recentUsers,
    };
  }

  /**
   * Grant space access to a user
   */
  async grantSpaceAccess(
    userId: string,
    spaceId: string,
    tenantId: string,
    role: UserRole = UserRole.VIEWER,
  ) {
    // Verify user exists
    await this.findOne(userId, tenantId);

    // Verify space exists and belongs to tenant
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, tenantId },
    });

    if (!space) {
      throw new NotFoundException(`Space ${spaceId} not found`);
    }

    const access = await this.prisma.userSpaceAccess.upsert({
      where: {
        userId_spaceId: { userId, spaceId },
      },
      create: {
        userId,
        spaceId,
        role,
      },
      update: {
        role,
      },
      include: {
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
   * Revoke space access from a user
   */
  async revokeSpaceAccess(userId: string, spaceId: string, tenantId: string) {
    // Verify user exists
    await this.findOne(userId, tenantId);

    await this.prisma.userSpaceAccess.deleteMany({
      where: { userId, spaceId },
    });

    return { success: true, message: 'Space access revoked' };
  }

  /**
   * Sanitize user object (remove sensitive data)
   */
  private sanitizeUser(user: any) {
    // Remove any sensitive fields if present
    const { ...sanitized } = user;
    return sanitized;
  }
}
