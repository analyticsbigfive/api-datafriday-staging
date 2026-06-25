import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePredictVersionDto, PatchPredictVersionDto, UpdatePredictVersionDto } from './dto/predict-version.dto';

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
    if (!version) throw new NotFoundException(`PredictVersion ${versionId} not found`);
    return version;
  }

  async findById(id: string, tenantId: string) {
    const version = await this.prisma.eventPredictVersion.findFirst({
      where: { id, tenantId },
    });
    if (!version) throw new NotFoundException(`PredictVersion ${id} not found`);
    return version;
  }

  async create(eventId: string, tenantId: string, dto: CreatePredictVersionDto, userId?: string) {
    return this.prisma.eventPredictVersion.create({
      data: {
        tenantId,
        eventId,
        spaceId: dto.spaceId ?? null,
        name: dto.name,
        isDefault: false,
        eventSnapshot: dto.eventSnapshot as any,
        totalRevenue: dto.totalRevenue ?? 0,
        adjustedTotalRevenue: dto.adjustedTotalRevenue ?? 0,
        perCapita: dto.perCapita ?? 0,
        adjustedPerCapita: dto.adjustedPerCapita ?? 0,
        menuConfig: (dto.menuConfig ?? {}) as any,
        quantityAdjustments: (dto.quantityAdjustments ?? {}) as any,
        manualQuantities: (dto.manualQuantities ?? {}) as any,
        selectedPredictionEventIds: dto.selectedPredictionEventIds ?? [],
        selectedTimeRange: (dto.selectedTimeRange ?? null) as any,
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
        menuConfig: (dto.menuConfig ?? {}) as any,
        quantityAdjustments: (dto.quantityAdjustments ?? {}) as any,
        manualQuantities: (dto.manualQuantities ?? {}) as any,
        selectedPredictionEventIds: dto.selectedPredictionEventIds ?? [],
        selectedTimeRange: (dto.selectedTimeRange ?? null) as any,
      },
    });
  }

  async patch(id: string, tenantId: string, dto: PatchPredictVersionDto) {
    await this.findById(id, tenantId);
    const data: Record<string, any> = {};
    const scalarFields = [
      'name', 'spaceId', 'eventSnapshot', 'totalRevenue', 'adjustedTotalRevenue',
      'perCapita', 'adjustedPerCapita', 'menuConfig', 'quantityAdjustments',
      'manualQuantities', 'selectedPredictionEventIds', 'selectedTimeRange',
    ] as const;
    for (const field of scalarFields) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }
    return this.prisma.eventPredictVersion.update({ where: { id }, data });
  }

  async remove(eventId: string, versionId: string, tenantId: string) {
    await this.findOne(eventId, versionId, tenantId);
    await this.prisma.eventPredictVersion.delete({ where: { id: versionId } });
  }

  async removeById(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    await this.prisma.eventPredictVersion.delete({ where: { id } });
  }

  async setDefault(eventId: string, versionId: string | null | undefined, tenantId: string) {
    const ops: any[] = [
      this.prisma.eventPredictVersion.updateMany({
        where: { eventId, tenantId },
        data: { isDefault: false },
      }),
    ];
    if (versionId) {
      ops.push(
        this.prisma.eventPredictVersion.update({
          where: { id: versionId },
          data: { isDefault: true },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    return { defaultVersionId: versionId || null };
  }
}
