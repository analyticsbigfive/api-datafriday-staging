import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(private prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto, tenantId: string) {
    this.logger.log(`Creating supplier "${createSupplierDto.name}" for tenant ${tenantId}`);
    try {
      const supplier = await this.prisma.supplier.create({
        data: {
          name: createSupplierDto.name,
          email: createSupplierDto.email,
          tel: createSupplierDto.phone,
          address: createSupplierDto.address,
          city: createSupplierDto.city,
          postcode: createSupplierDto.postcode,
          picture: createSupplierDto.picture,
          contactName: createSupplierDto.contactName,
          sites: createSupplierDto.spaceIds || [],
          configurationIds: createSupplierDto.configurationIds || [],
          sectors: createSupplierDto.sectors || [],
          tenant: {
            connect: { id: tenantId },
          },
        },
      });
      this.logger.log(`Supplier created successfully: ${supplier.id}`);
      return supplier;
    } catch (error) {
      this.logger.error(`Failed to create supplier: ${error.message}`, error.stack);
      if (error.code === 'P2003') {
        throw new BadRequestException(`Invalid tenantId provided`);
      }
      if (error.code === 'P2002') {
        throw new BadRequestException(`A supplier with this name already exists`);
      }
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching suppliers for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [suppliers, total] = await this.prisma.$transaction([
        this.prisma.supplier.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        this.prisma.supplier.count({ where: { tenantId } }),
      ]);
      this.logger.log(`Found ${suppliers.length} suppliers (total: ${total})`);
      return {
        data: suppliers,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch suppliers: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching supplier ${id} for tenant ${tenantId}`);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      this.logger.warn(`Supplier ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto, tenantId: string) {
    this.logger.log(`Updating supplier ${id} for tenant ${tenantId}`);
    // Verify existence
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (updateSupplierDto.name !== undefined) updateData.name = updateSupplierDto.name;
    if (updateSupplierDto.email !== undefined) updateData.email = updateSupplierDto.email;
    if (updateSupplierDto.phone !== undefined) updateData.tel = updateSupplierDto.phone;
    if (updateSupplierDto.address !== undefined) updateData.address = updateSupplierDto.address;
    if (updateSupplierDto.city !== undefined) updateData.city = updateSupplierDto.city;
    if (updateSupplierDto.postcode !== undefined) updateData.postcode = updateSupplierDto.postcode;
    if (updateSupplierDto.picture !== undefined) updateData.picture = updateSupplierDto.picture;
    if (updateSupplierDto.contactName !== undefined) updateData.contactName = updateSupplierDto.contactName;
    if (updateSupplierDto.spaceIds !== undefined) updateData.sites = updateSupplierDto.spaceIds;
    if (updateSupplierDto.configurationIds !== undefined) updateData.configurationIds = updateSupplierDto.configurationIds;
    if (updateSupplierDto.sectors !== undefined) updateData.sectors = updateSupplierDto.sectors;

    try {
      const supplier = await this.prisma.supplier.update({
        where: { id },
        data: updateData,
      });
      this.logger.log(`Supplier ${id} updated successfully`);
      return supplier;
    } catch (error) {
      this.logger.error(`Failed to update supplier ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Supplier with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting supplier ${id} for tenant ${tenantId}`);
    // Verify existence
    await this.findOne(id, tenantId);

    try {
      const result = await this.prisma.supplier.delete({
        where: { id },
      });
      this.logger.log(`Supplier ${id} deleted successfully`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete supplier ${id}: ${error.message}`, error.stack);
      if (error.code === 'P2025') {
        throw new NotFoundException(`Supplier with ID ${id} not found`);
      }
      throw error;
    }
  }
}
