import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionScope } from '@prisma/client';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catalogue système (tenantId = null) + permissions custom du tenant courant.
   */
  async findAll(tenantId: string) {
    return this.prisma.permission.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findFirst({
      where: { tenantId, code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Permission with code "${dto.code}" already exists`);
    }

    const permission = await this.prisma.permission.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        scope: PermissionScope.CUSTOM,
        isSystem: false,
      },
    });

    this.logger.log(`Permission "${permission.code}" created for tenant ${tenantId}`);

    return permission;
  }

  async update(id: string, tenantId: string, dto: UpdatePermissionDto) {
    const permission = await this.findOneOrFail(id, tenantId);

    if (permission.isSystem) {
      throw new ForbiddenException('System permissions are read-only and cannot be modified');
    }

    return this.prisma.permission.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
      },
    });
  }

  async remove(id: string, tenantId: string) {
    const permission = await this.findOneOrFail(id, tenantId);

    if (permission.isSystem) {
      throw new ForbiddenException('System permissions are read-only and cannot be deleted');
    }

    await this.prisma.permission.delete({ where: { id } });

    this.logger.log(`Permission "${permission.code}" deleted from tenant ${tenantId}`);

    return { success: true, message: 'Permission deleted successfully' };
  }

  private async findOneOrFail(id: string, tenantId: string) {
    const permission = await this.prisma.permission.findUnique({ where: { id } });

    if (!permission || (permission.tenantId !== null && permission.tenantId !== tenantId)) {
      throw new NotFoundException(`Permission ${id} not found`);
    }

    return permission;
  }
}
