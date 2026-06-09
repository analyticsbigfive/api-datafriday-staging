import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class DisplayNamesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.displayName.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string, tenantId: string) {
    try {
      return await this.prisma.displayName.create({
        data: { name: name.trim(), tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A display name "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const item = await this.prisma.displayName.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`DisplayName ${id} not found`);
    await this.prisma.displayName.delete({ where: { id } });
    return { deleted: true };
  }
}
