import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.brand.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string, tenantId: string) {
    try {
      return await this.prisma.brand.create({
        data: { name: name.trim(), tenantId },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException(`A brand named "${name}" already exists`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) throw new NotFoundException(`Brand ${id} not found`);
    await this.prisma.brand.delete({ where: { id } });
    return { deleted: true };
  }
}
