import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateMenuComponentDto } from './dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from './dto/update-menu-component.dto';

@Injectable()
export class MenuComponentsService {
  private readonly logger = new Logger(MenuComponentsService.name);

  constructor(private prisma: PrismaService) {}

  private readonly includeRelations = {
    ingredients: {
      include: { ingredient: true },
    },
    children: {
      include: { child: true },
    },
    parents: {
      include: { parent: true },
    },
  };

  async create(dto: CreateMenuComponentDto, tenantId: string) {
    this.logger.log(`Creating menu component "${dto.name}" for tenant ${tenantId}`);
    try {
      const component = await this.prisma.menuComponent.create({
        data: {
          tenantId,
          name: dto.name,
          unit: dto.unit,
          category: dto.category,
          unitCost: dto.unitCost,
          allergens: dto.allergens || [],
          description: dto.description,
          storageType: dto.storageType as any,
          subComponents: dto.subComponents,
          componentCategory: dto.componentCategory,
          numberOfUnitsRecipe: dto.numberOfUnitsRecipe,
        },
        include: this.includeRelations,
      });
      this.logger.log(`Menu component created: ${component.id}`);
      return component;
    } catch (error) {
      this.logger.error(`Failed to create menu component: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findAll(tenantId: string, page = 1, limit = 100) {
    this.logger.log(`Fetching menu components for tenant ${tenantId} (page=${page}, limit=${limit})`);
    try {
      const skip = (page - 1) * limit;
      const [components, total] = await Promise.all([
        this.prisma.menuComponent.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: 'asc' },
          include: this.includeRelations,
          skip,
          take: limit,
        }),
        this.prisma.menuComponent.count({ where: { tenantId, deletedAt: null } }),
      ]);
      this.logger.log(`Found ${components.length}/${total} menu components`);
      return {
        data: components,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.logger.error(`Failed to fetch menu components: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string, tenantId: string) {
    this.logger.log(`Fetching menu component ${id} for tenant ${tenantId}`);
    const component = await this.prisma.menuComponent.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.includeRelations,
    });

    if (!component) {
      this.logger.warn(`Menu component ${id} not found for tenant ${tenantId}`);
      throw new NotFoundException(`Menu component with ID ${id} not found`);
    }

    return component;
  }

  async update(id: string, dto: UpdateMenuComponentDto, tenantId: string) {
    this.logger.log(`Updating menu component ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.unit !== undefined) updateData.unit = dto.unit;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.unitCost !== undefined) updateData.unitCost = dto.unitCost;
    if (dto.allergens !== undefined) updateData.allergens = dto.allergens;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.storageType !== undefined) updateData.storageType = dto.storageType as any;
    if (dto.subComponents !== undefined) updateData.subComponents = dto.subComponents;
    if (dto.componentCategory !== undefined) updateData.componentCategory = dto.componentCategory;
    if (dto.numberOfUnitsRecipe !== undefined) updateData.numberOfUnitsRecipe = dto.numberOfUnitsRecipe;

    try {
      const component = await this.prisma.menuComponent.update({
        where: { id },
        data: updateData,
        include: this.includeRelations,
      });
      this.logger.log(`Menu component ${id} updated`);
      return component;
    } catch (error) {
      this.logger.error(`Failed to update menu component ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async remove(id: string, tenantId: string) {
    this.logger.log(`Deleting menu component ${id} for tenant ${tenantId}`);
    await this.findOne(id, tenantId);

    try {
      const result = await this.prisma.menuComponent.update({ where: { id }, data: { deletedAt: new Date() } });
      this.logger.log(`Menu component ${id} soft-deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu component ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async repair(tenantId: string) {
    this.logger.log(`Repairing menu components for tenant ${tenantId}...`);
    try {
      // Recalculate unit costs from subComponents
      const components = await this.prisma.menuComponent.findMany({
        where: { tenantId },
        include: this.includeRelations,
      });

      let repaired = 0;
      for (const comp of components) {
        const subComps = comp.subComponents as any[];
        if (subComps && Array.isArray(subComps) && subComps.length > 0) {
          const totalCost = subComps.reduce((sum, sub) => sum + (Number(sub.cost) || 0), 0);
          const unitCost = totalCost * (comp.numberOfUnitsRecipe || 1);
          await this.prisma.menuComponent.update({
            where: { id: comp.id },
            data: { unitCost },
          });
          repaired++;
        }
      }

      this.logger.log(`Repaired ${repaired} menu components`);
      return { repaired, total: components.length };
    } catch (error) {
      this.logger.error(`Failed to repair menu components: ${error.message}`, error.stack);
      throw error;
    }
  }
}
