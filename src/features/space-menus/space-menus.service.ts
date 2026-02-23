import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class SpaceMenusService {
  private readonly logger = new Logger(SpaceMenusService.name);

  constructor(private prisma: PrismaService) {}

  async getMenuConfiguration(spaceId: string, configId: string) {
    this.logger.log(`Getting menu config for space=${spaceId} config=${configId}`);
    const record = await this.prisma.spaceMenuConfig.findUnique({
      where: { spaceId_configId: { spaceId, configId } },
    });
    return record ? { spaceId, configId, menuItems: record.menuItems } : { spaceId, configId, menuItems: {} };
  }

  async saveMenuConfiguration(spaceId: string, configId: string, menuItems: Record<string, Record<string, boolean>>) {
    this.logger.log(`Saving menu config for space=${spaceId} config=${configId}`);
    const record = await this.prisma.spaceMenuConfig.upsert({
      where: { spaceId_configId: { spaceId, configId } },
      create: { spaceId, configId, menuItems },
      update: { menuItems },
    });
    return { spaceId, configId, menuItems: record.menuItems };
  }
}
