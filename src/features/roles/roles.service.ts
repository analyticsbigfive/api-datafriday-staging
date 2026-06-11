import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { JwtDatabaseStrategy } from '../../core/auth/strategies/jwt-db-lookup.strategy';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Prisma } from '@prisma/client';

const ROLE_WITH_PERMISSIONS = Prisma.validator<Prisma.RoleInclude>()({
  permissions: { include: { permission: true } },
});

type RoleWithPermissions = Prisma.RoleGetPayload<{ include: typeof ROLE_WITH_PERMISSIONS }>;

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtDatabaseStrategy: JwtDatabaseStrategy,
  ) {}

  /**
   * Rôles du tenant courant, avec leurs permissions peuplées.
   */
  async findAll(tenantId: string) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId },
      include: ROLE_WITH_PERMISSIONS,
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((role) => this.serialize(role));
  }

  async findOne(id: string, tenantId: string) {
    return this.serialize(await this.findOneOrFail(id, tenantId));
  }

  async create(tenantId: string, dto: CreateRoleDto) {
    const existing = await this.prisma.role.findFirst({
      where: { tenantId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Role "${dto.name}" already exists`);
    }

    const role = await this.prisma.role.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        isSystem: false,
        systemKey: null,
        permissions: {
          create: dto.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      include: ROLE_WITH_PERMISSIONS,
    });

    this.logger.log(`Role "${role.name}" created for tenant ${tenantId}`);

    return this.serialize(role);
  }

  async update(id: string, tenantId: string, dto: UpdateRoleDto) {
    const role = await this.findOneOrFail(id, tenantId);

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new BadRequestException('System role name cannot be changed');
    }

    if (dto.name && dto.name !== role.name) {
      const existing = await this.prisma.role.findFirst({
        where: { tenantId, name: dto.name, NOT: { id } },
      });

      if (existing) {
        throw new ConflictException(`Role "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }

      return tx.role.update({
        where: { id },
        data: {
          name: role.isSystem ? undefined : dto.name,
          description: dto.description,
        },
        include: ROLE_WITH_PERMISSIONS,
      });
    });

    if (dto.permissionIds) {
      await this.invalidateUsersCache(id);
    }

    return this.serialize(updated);
  }

  async remove(id: string, tenantId: string) {
    const role = await this.findOneOrFail(id, tenantId);

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const [usersCount, userTenantsCount] = await Promise.all([
      this.prisma.user.count({ where: { roleId: id } }),
      this.prisma.userTenant.count({ where: { roleId: id } }),
    ]);

    if (usersCount > 0 || userTenantsCount > 0) {
      throw new ConflictException(
        'Cannot delete a role assigned to one or more users. Reassign these users first.',
      );
    }

    await this.prisma.role.delete({ where: { id } });

    this.logger.log(`Role "${role.name}" deleted from tenant ${tenantId}`);

    return { success: true, message: 'Role deleted successfully' };
  }

  private async findOneOrFail(id: string, tenantId: string): Promise<RoleWithPermissions> {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: ROLE_WITH_PERMISSIONS,
    });

    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }

    return role;
  }

  private serialize(role: RoleWithPermissions) {
    return {
      id: role.id,
      tenantId: role.tenantId,
      name: role.name,
      description: role.description,
      systemKey: role.systemKey,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((rp) => rp.permission),
    };
  }

  /**
   * Invalide le cache JWT-DB des utilisateurs ayant ce rôle, après une mise à
   * jour de ses permissions (cf. RBAC_SYSTEM.md §3.7).
   */
  private async invalidateUsersCache(roleId: string) {
    const users = await this.prisma.user.findMany({
      where: { roleId },
      select: { id: true },
    });

    await Promise.all(users.map((u) => this.jwtDatabaseStrategy.invalidateUserCache(u.id)));
  }
}
