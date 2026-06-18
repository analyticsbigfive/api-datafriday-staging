import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class KvService {
  private readonly logger = new Logger(KvService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string, tenantId?: string) {
    this.logger.log(`GET /kv/${key} tenant=${tenantId ?? 'null'}`);
    const entry = await this.prisma.kvStore.findFirst({
      where: { key, tenantId: tenantId ?? null },
    });
    if (!entry) {
      throw new NotFoundException(`KV key not found: ${key}`);
    }
    return entry;
  }

  async set(key: string, value: unknown, tenantId?: string) {
    this.logger.log(`PUT /kv/${key} tenant=${tenantId ?? 'null'}`);
    return this.prisma.kvStore.upsert({
      where: {
        uniq_kv_store: { tenantId: tenantId ?? null, key },
      },
      create: { key, tenantId: tenantId ?? null, value: value as any },
      update: { value: value as any },
    });
  }
}
