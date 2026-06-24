import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class RestockStateService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSpaceOwnership(spaceId: string, tenantId: string): Promise<void> {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } });
    if (!space) throw new ForbiddenException(`Space ${spaceId} not found for tenant`);
  }

  async get(spaceId: string, tenantId: string) {
    // Pas de ownership check : la query est déjà scopée (tenantId, spaceId).
    // Si le space n'appartient pas au tenant → 0 ligne → null. Aucune fuite.
    const record = await this.prisma.restockState.findUnique({
      where: { tenantId_spaceId: { tenantId, spaceId } },
    });
    return record ?? null;
  }

  async upsert(
    spaceId: string,
    tenantId: string,
    state: Record<string, unknown>,
    userId?: string,
  ) {
    // Le `state` est un blob opaque : seule garantie exigée = « objet JSON ».
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new BadRequestException('Le corps doit être un objet JSON (snapshot de réarmement).');
    }
    // Ownership check conservé sur l'upsert pour éviter les lignes orphelines
    // (un tenant qui écrit sur un spaceId qui ne lui appartient pas).
    await this.assertSpaceOwnership(spaceId, tenantId);
    return this.prisma.restockState.upsert({
      where: { tenantId_spaceId: { tenantId, spaceId } },
      update: { state: state as any, updatedAt: new Date() },
      create: { tenantId, spaceId, state: state as any, createdBy: userId ?? null },
    });
  }

  async remove(spaceId: string, tenantId: string) {
    // deleteMany est déjà scoped (tenantId + spaceId) → idempotent et sûr sans check.
    await this.prisma.restockState.deleteMany({ where: { tenantId, spaceId } });
  }
}
