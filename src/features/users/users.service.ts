import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { SupabaseAdminService } from '../../core/supabase/supabase-admin.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtDatabaseStrategy: JwtDatabaseStrategy,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the tenant's Role row matching a system key (ADMIN/MANAGER/...).
   * Returns null when the tenant has no cloned roles yet (legacy tenants);
   * callers fall back to the legacy enum on `User.role`.
   */
  private async resolveRoleId(
    tenantId: string,
    systemKey: UserRole,
  ): Promise<string | null> {
    const role = await this.prisma.role.findFirst({
      where: { tenantId, systemKey },
      select: { id: true },
    });
    return role?.id ?? null;
  }

  /**
   * Resolve a role from either a dynamic `roleId` (preferred, from the UI) or a
   * legacy system `role` enum. Returns both the effective systemKey (for the
   * legacy `User.role` column) and the `roleId` FK.
   */
  private async resolveRole(
    tenantId: string,
    opts: { roleId?: string; role?: UserRole },
  ): Promise<{ systemKey: UserRole; roleId: string | null }> {
    if (opts.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: opts.roleId, tenantId },
        select: { id: true, systemKey: true },
      });
      if (!role) {
        throw new NotFoundException(`Role ${opts.roleId} not found`);
      }
      return { systemKey: role.systemKey ?? UserRole.VIEWER, roleId: role.id };
    }

    const systemKey = opts.role ?? UserRole.VIEWER;
    const roleId = await this.resolveRoleId(tenantId, systemKey);
    return { systemKey, roleId };
  }

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

    const { systemKey: role, roleId } = await this.resolveRole(tenantId, {
      roleId: dto.roleId,
      role: dto.role,
    });
    const fullName = `${dto.firstName} ${dto.lastName}`;

    // 1) Provision the real Supabase auth account — its id becomes the DB User id
    //    so the user can actually authenticate (JWT `sub` === User.id).
    const supabaseUser = await this.supabaseAdmin.createUser({
      email: dto.email,
      password: dto.password,
      emailConfirm: true,
      userMetadata: { firstName: dto.firstName, lastName: dto.lastName, tenantId },
    });

    // 2) Mirror in our DB. On failure, roll back the Supabase account to avoid orphans.
    try {
      const user = await this.prisma.user.create({
        data: {
          id: supabaseUser.id,
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          fullName,
          role,
          roleId,
          avatar: dto.avatar,
          tenantId,
        },
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });

      await this.prisma.userTenant.create({
        data: {
          userId: user.id,
          tenantId,
          role,
          roleId,
          isOwner: false,
        },
      });

      this.logger.log(`User ${user.email} (${user.id}) created for tenant ${tenantId}`);

      return this.sanitizeUser(user);
    } catch (error) {
      await this.supabaseAdmin.deleteUser(supabaseUser.id);
      this.logger.error(
        `DB user creation failed for ${dto.email}; rolled back Supabase account ${supabaseUser.id}`,
      );
      throw error;
    }
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

    // Delete UserTenant relation for THIS tenant
    await this.prisma.userTenant.deleteMany({
      where: { userId: id, tenantId },
    });

    // Does the user still belong to any other organization?
    const remainingMemberships = await this.prisma.userTenant.count({
      where: { userId: id },
    });

    // Delete the user row for this tenant
    await this.prisma.user.delete({
      where: { id },
    });

    // Only tear down the Supabase auth account when the user has no remaining
    // organization (otherwise they'd lose access to their other tenants).
    if (remainingMemberships === 0) {
      await this.supabaseAdmin.deleteUser(id);
    }

    // The user's role/permissions changed — invalidate their auth cache cluster-wide.
    await this.jwtDatabaseStrategy.invalidateUserCache(id);

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

    if (!dto.roleId && !dto.role) {
      throw new BadRequestException('Either roleId or role must be provided');
    }

    // Resolve the dynamic Role row (new `roleId`, or legacy `role` enum mapped via systemKey)
    let roleRecord: { id: string; name: string; systemKey: UserRole | null } | null = null;
    let resolvedRole: UserRole;

    if (dto.roleId) {
      roleRecord = await this.prisma.role.findFirst({
        where: { id: dto.roleId, tenantId },
        select: { id: true, name: true, systemKey: true },
      });

      if (!roleRecord) {
        throw new NotFoundException(`Role ${dto.roleId} not found`);
      }

      resolvedRole = roleRecord.systemKey ?? UserRole.VIEWER;
    } else {
      resolvedRole = dto.role as UserRole;
      roleRecord = await this.prisma.role.findFirst({
        where: { tenantId, systemKey: resolvedRole },
        select: { id: true, name: true, systemKey: true },
      });
    }

    // Only ADMIN can promote to ADMIN
    if (resolvedRole === UserRole.ADMIN && currentUserRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can promote users to admin');
    }

    // Verify user exists
    const user = await this.findOne(id, tenantId);

    // Cannot demote organization owner
    const userTenant = await this.prisma.userTenant.findFirst({
      where: { userId: id, tenantId },
    });

    if (userTenant?.isOwner && resolvedRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot demote the organization owner');
    }

    const data = {
      role: resolvedRole,
      roleId: roleRecord?.id,
    };

    // Update role in User table
    await this.prisma.user.update({
      where: { id },
      data,
    });

    // Update role in UserTenant table
    await this.prisma.userTenant.updateMany({
      where: { userId: id, tenantId },
      data,
    });

    // Invalidate the JWT-DB auth cache so the new role/permissions apply immediately
    await this.jwtDatabaseStrategy.invalidateUserCache(id);

    this.logger.log(`User ${id} role changed to ${resolvedRole}`);

    return {
      ...user,
      role: resolvedRole,
      roleId: roleRecord?.id ?? null,
      message: `Role changed to ${resolvedRole}`,
    };
  }

  /**
   * Invite a user to the tenant.
   *
   * Three cases, handled gracefully:
   *  - brand-new email → create the Supabase account + send the invitation email;
   *  - email already has a Supabase account but no DB profile → attach it to this
   *    tenant (they sign in with their existing password, no email);
   *  - email already belongs to a DB profile → clear 409 (already member here, or
   *    rattached to another organization).
   */
  async invite(tenantId: string, dto: InviteUserDto, invitedBy: string) {
    // Already a member of THIS tenant?
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });

    if (existing) {
      throw new ConflictException(`User ${dto.email} is already a member of this organization`);
    }

    const { systemKey: role, roleId } = await this.resolveRole(tenantId, {
      roleId: dto.roleId,
      role: dto.role,
    });

    // Admin may pre-fill the name; otherwise the invitee sets it on acceptance.
    const firstName = dto.firstName?.trim() || 'Invited';
    const lastName = dto.lastName?.trim() || 'User';
    const fullName = `${firstName} ${lastName}`.trim();
    const profile = { email: dto.email, firstName, lastName, fullName, role, roleId };

    // Does this email already have a Supabase auth account?
    const existingSupabaseUser = await this.supabaseAdmin.getUserByEmail(dto.email);
    if (existingSupabaseUser) {
      return this.attachExistingAccountToTenant(existingSupabaseUser.id, tenantId, profile);
    }

    // Brand-new person: send the real invitation email + create the (pending) auth
    // user. The returned id is reused as the DB User id so they can authenticate.
    const redirectTo = this.config.get<string>('INVITE_REDIRECT_URL');
    const supabaseUser = await this.supabaseAdmin.inviteUserByEmail(dto.email, {
      redirectTo,
      data: { tenantId, invitedBy, firstName, lastName },
    });

    // Mirror in our DB (pending profile, completed when the invite is accepted).
    try {
      const user = await this.createMembership(supabaseUser.id, tenantId, profile);
      this.logger.log(
        `Invitation sent to ${dto.email} (${user.id}) for tenant ${tenantId} by ${invitedBy}`,
      );
      return {
        success: true,
        message: `Invitation sent to ${dto.email}`,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      await this.supabaseAdmin.deleteUser(supabaseUser.id);
      this.logger.error(
        `DB user creation failed for invite ${dto.email}; rolled back Supabase account ${supabaseUser.id}`,
      );
      throw error;
    }
  }

  /**
   * Attach an EXISTING Supabase account to a tenant. Never duplicates the User
   * row (User.id = Supabase id is the primary key).
   */
  private async attachExistingAccountToTenant(
    supabaseUserId: string,
    tenantId: string,
    profile: { email: string; firstName: string; lastName: string; fullName: string; role: UserRole; roleId: string | null },
  ) {
    const dbUser = await this.prisma.user.findUnique({ where: { id: supabaseUserId } });

    if (dbUser) {
      if (dbUser.tenantId === tenantId) {
        throw new ConflictException(`User ${profile.email} is already a member of this organization`);
      }
      // Multi-organization per user isn't exposed in the app yet — fail clearly.
      throw new ConflictException(
        `Un compte existe déjà avec l'email ${profile.email} et est rattaché à une autre organisation.`,
      );
    }

    // Supabase account exists but no DB profile (e.g. abandoned signup): create
    // the profile + membership. They already have a password → no email needed.
    const user = await this.createMembership(supabaseUserId, tenantId, profile);
    await this.jwtDatabaseStrategy.invalidateUserCache(user.id);
    this.logger.log(`Linked existing Supabase account ${supabaseUserId} to tenant ${tenantId}`);

    return {
      success: true,
      message:
        "Ce compte existait déjà : il a été rattaché à votre organisation. L'utilisateur peut se connecter avec son mot de passe existant.",
      user: this.sanitizeUser(user),
    };
  }

  /** Create the User row + UserTenant membership for a given Supabase id. */
  private async createMembership(
    userId: string,
    tenantId: string,
    profile: { email: string; firstName: string; lastName: string; fullName: string; role: UserRole; roleId: string | null },
  ) {
    const user = await this.prisma.user.create({
      data: {
        id: userId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
        role: profile.role,
        roleId: profile.roleId,
        tenantId,
      },
    });

    await this.prisma.userTenant.create({
      data: {
        userId: user.id,
        tenantId,
        role: profile.role,
        roleId: profile.roleId,
        isOwner: false,
      },
    });

    return user;
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
