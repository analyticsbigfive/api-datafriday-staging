import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto, tenantId: string) {
    return this.prisma.supplier.create({
      data: {
        id: `sup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: createSupplierDto.name,
        email: createSupplierDto.email,
        tel: createSupplierDto.phone,
        address: createSupplierDto.address,
        tenant: {
          connect: { id: tenantId },
        },
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto, tenantId: string) {
    // Verify existence
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (updateSupplierDto.name !== undefined) updateData.name = updateSupplierDto.name;
    if (updateSupplierDto.email !== undefined) updateData.email = updateSupplierDto.email;
    if (updateSupplierDto.phone !== undefined) updateData.tel = updateSupplierDto.phone;
    if (updateSupplierDto.address !== undefined) updateData.address = updateSupplierDto.address;

    return this.prisma.supplier.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string, tenantId: string) {
    // Verify existence
    await this.findOne(id, tenantId);

    return this.prisma.supplier.delete({
      where: { id },
    });
  }
}
