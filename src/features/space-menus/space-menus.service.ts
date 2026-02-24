import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class SpaceMenusService {
  private readonly logger = new Logger(SpaceMenusService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get menu assignments for all elements in a config
   * Returns { [elementId]: { [menuItemId]: boolean } }
   */
  async getMenuConfiguration(spaceId: string, configId: string) {
    this.logger.log(`Getting menu config for space=${spaceId} config=${configId}`);

    // Get all elements belonging to floors/forecourt of this config
    const elements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { configId } },
          { forecourt: { configId } },
        ],
      },
      select: {
        id: true,
        menuAssignments: {
          select: { menuItemId: true, enabled: true },
        },
      },
    } as any);

    // Build the { elementId: { menuItemId: boolean } } map
    const menuItems: Record<string, Record<string, boolean>> = {};
    for (const el of elements) {
      if ((el as any).menuAssignments?.length) {
        menuItems[el.id] = {};
        for (const a of (el as any).menuAssignments) {
          menuItems[el.id][a.menuItemId] = a.enabled;
        }
      }
    }

    return { spaceId, configId, menuItems };
  }

  /**
   * Save menu assignments for elements in a config
   * Input: { [elementId]: { [menuItemId]: boolean } }
   */
  async saveMenuConfiguration(spaceId: string, configId: string, menuItems: Record<string, Record<string, boolean>>) {
    this.logger.log(`Saving menu config for space=${spaceId} config=${configId}`);

    await this.prisma.$transaction(async (tx) => {
      // For each element, upsert menu assignments
      for (const [elementId, items] of Object.entries(menuItems)) {
        for (const [menuItemId, enabled] of Object.entries(items)) {
          await (tx as any).menuAssignment.upsert({
            where: { elementId_menuItemId: { elementId, menuItemId } },
            create: { elementId, menuItemId, enabled },
            update: { enabled },
          });
        }

        // Remove assignments for menu items not in the map
        const activeMenuItemIds = Object.keys(items);
        if (activeMenuItemIds.length) {
          await (tx as any).menuAssignment.deleteMany({
            where: {
              elementId,
              menuItemId: { notIn: activeMenuItemIds },
            },
          });
        }
      }
    });

    return this.getMenuConfiguration(spaceId, configId);
  }
}
