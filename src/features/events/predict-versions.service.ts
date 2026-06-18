import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePredictVersionDto, UpdatePredictVersionDto } from './dto/predict-version.dto';

@Injectable()
export class PredictVersionsService {
  private readonly logger = new Logger(PredictVersionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(eventId: string, tenantId: string) {
    return this.prisma.eventPredictVersion.findMany({
      where: { eventId, tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(eventId: string, versionId: string, tenantId: string) {
    const version = await this.prisma.eventPredictVersion.findFirst({
      where: { id: versionId, eventId, tenantId },
    });
    if (!version) {
      throw new NotFoundException(`PredictVersion ${versionId} not found`);
    }
    return version;
  }

  async create(eventId: string, tenantId: string, dto: CreatePredictVersionDto, userId?: string) {
    return this.prisma.eventPredictVersion.create({
      data: {
        tenantId,
        eventId,
        spaceId: dto.spaceId ?? null,
        name: dto.name,
        isDefault: dto.isDefault ?? false,
        eventSnapshot: dto.eventSnapshot as any,
        totalRevenue: dto.totalRevenue ?? 0,
        adjustedTotalRevenue: dto.adjustedTotalRevenue ?? 0,
        perCapita: dto.perCapita ?? 0,
        adjustedPerCapita: dto.adjustedPerCapita ?? 0,
        menuConfig: dto.menuConfig as any,
        quantityAdjustments: dto.quantityAdjustments as any,
        selectedPredictionEventIds: dto.selectedPredictionEventIds ?? [],
        createdBy: userId ?? null,
      },
    });
  }

  async update(eventId: string, versionId: string, tenantId: string, dto: UpdatePredictVersionDto) {
    await this.findOne(eventId, versionId, tenantId);
    return this.prisma.eventPredictVersion.update({
      where: { id: versionId },
      data: {
        name: dto.name,
        spaceId: dto.spaceId ?? null,
        isDefault: dto.isDefault ?? false,
        eventSnapshot: dto.eventSnapshot as any,
        totalRevenue: dto.totalRevenue ?? 0,
        adjustedTotalRevenue: dto.adjustedTotalRevenue ?? 0,
        perCapita: dto.perCapita ?? 0,
        adjustedPerCapita: dto.adjustedPerCapita ?? 0,
        menuConfig: dto.menuConfig as any,
        quantityAdjustments: dto.quantityAdjustments as any,
        selectedPredictionEventIds: dto.selectedPredictionEventIds ?? [],
      },
    });
  }

  async remove(eventId: string, versionId: string, tenantId: string) {
    await this.findOne(eventId, versionId, tenantId);
    await this.prisma.eventPredictVersion.delete({ where: { id: versionId } });
  }

  // Sets one version as default for an event, clearing all others in a transaction
  async setDefault(eventId: string, versionId: string, tenantId: string) {
    await this.findOne(eventId, versionId, tenantId);
    await this.prisma.$transaction([
      this.prisma.eventPredictVersion.updateMany({
        where: { eventId, tenantId },
        data: { isDefault: false },
      }),
      this.prisma.eventPredictVersion.update({
        where: { id: versionId },
        data: { isDefault: true },
      }),
    ]);
    return this.prisma.eventPredictVersion.findUnique({ where: { id: versionId } });
  }
}
