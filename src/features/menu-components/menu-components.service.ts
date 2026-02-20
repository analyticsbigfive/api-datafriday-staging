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

  async create(dto: CreateMenuComponentDto) {
    this.logger.log(`Creating menu component "${dto.name}"`);
    try {
      const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const component = await this.prisma.menuComponent.create({
        data: {
          id,
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

  async findAll() {
    this.logger.log('Fetching all menu components');
    try {
      const components = await this.prisma.menuComponent.findMany({
        orderBy: { name: 'asc' },
        include: this.includeRelations,
      });
      this.logger.log(`Found ${components.length} menu components`);
      return components;
    } catch (error) {
      this.logger.error(`Failed to fetch menu components: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(id: string) {
    this.logger.log(`Fetching menu component ${id}`);
    const component = await this.prisma.menuComponent.findUnique({
      where: { id },
      include: this.includeRelations,
    });

    if (!component) {
      this.logger.warn(`Menu component ${id} not found`);
      throw new NotFoundException(`Menu component with ID ${id} not found`);
    }

    return component;
  }

  async update(id: string, dto: UpdateMenuComponentDto) {
    this.logger.log(`Updating menu component ${id}`);
    await this.findOne(id);

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

  async remove(id: string) {
    this.logger.log(`Deleting menu component ${id}`);
    await this.findOne(id);

    try {
      const result = await this.prisma.menuComponent.delete({ where: { id } });
      this.logger.log(`Menu component ${id} deleted`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete menu component ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async repair() {
    this.logger.log('Repairing menu components...');
    try {
      // Recalculate unit costs from subComponents
      const components = await this.prisma.menuComponent.findMany({
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
