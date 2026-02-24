import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { HttpService } from '@nestjs/axios';
import { createHmac } from 'crypto';
import { firstValueFrom } from 'rxjs';

export interface WebhookEvent {
  event: string;
  tenantId: string;
  data: any;
  timestamp?: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private http: HttpService,
  ) {}

  /**
   * Dispatch a webhook event to all active subscribers for a tenant
   */
  async dispatch(payload: WebhookEvent): Promise<void> {
    const { event, tenantId, data } = payload;
    const timestamp = payload.timestamp || new Date().toISOString();

    // Find all active webhooks for this tenant that subscribe to this event
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        tenantId,
        active: true,
        events: { has: event },
      },
    });

    if (!webhooks.length) return;

    this.logger.log(`Dispatching "${event}" to ${webhooks.length} webhook(s) for tenant ${tenantId}`);

    // Fire all webhooks in parallel (fire-and-forget pattern)
    const promises = webhooks.map((webhook) =>
      this.send(webhook, event, data, timestamp),
    );

    // Don't block the caller — log errors but don't throw
    Promise.allSettled(promises).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        this.logger.warn(`${failed}/${webhooks.length} webhook(s) failed for "${event}"`);
      }
    });
  }

  /**
   * Send a single webhook request and log the result
   */
  private async send(
    webhook: any,
    event: string,
    data: any,
    timestamp: string,
  ): Promise<void> {
    const body = JSON.stringify({ event, data, timestamp });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Timestamp': timestamp,
    };

    // Sign payload with HMAC-SHA256 if secret is configured
    if (webhook.secret) {
      const signature = createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const startTime = Date.now();
    let status = 0;
    let response = '';
    let success = false;

    try {
      const result = await firstValueFrom(
        this.http.post(webhook.url, body, {
          headers,
          timeout: 10000, // 10s timeout
          validateStatus: () => true, // Don't throw on non-2xx
        }),
      );

      status = result.status;
      response = typeof result.data === 'string'
        ? result.data.substring(0, 500)
        : JSON.stringify(result.data).substring(0, 500);
      success = status >= 200 && status < 300;

      if (!success) {
        this.logger.warn(`Webhook ${webhook.id} returned ${status} for "${event}"`);
      }
    } catch (error) {
      status = 0;
      response = error.message?.substring(0, 500) || 'Unknown error';
      this.logger.error(`Webhook ${webhook.id} failed: ${error.message}`);
    }

    const duration = Date.now() - startTime;

    // Log the webhook delivery attempt
    await this.prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        event,
        payload: { data, timestamp },
        status,
        response,
        duration,
        success,
      },
    }).catch((err) => {
      this.logger.error(`Failed to log webhook delivery: ${err.message}`);
    });
  }

  // ── CRUD for webhook subscriptions ──

  async findAll(tenantId: string) {
    return this.prisma.webhook.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { logs: true } } },
    });
  }

  async create(tenantId: string, dto: { url: string; events: string[]; secret?: string }) {
    return this.prisma.webhook.create({
      data: { tenantId, url: dto.url, events: dto.events, secret: dto.secret },
    });
  }

  async update(id: string, tenantId: string, dto: { url?: string; events?: string[]; secret?: string; active?: boolean }) {
    await this.prisma.webhook.findFirstOrThrow({ where: { id, tenantId } });
    return this.prisma.webhook.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.prisma.webhook.findFirstOrThrow({ where: { id, tenantId } });
    return this.prisma.webhook.delete({ where: { id } });
  }

  async getLogs(webhookId: string, tenantId: string, limit = 50) {
    await this.prisma.webhook.findFirstOrThrow({ where: { id: webhookId, tenantId } });
    return this.prisma.webhookLog.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
