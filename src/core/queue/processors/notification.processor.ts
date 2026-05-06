import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../queue.constants';
import { NotificationJobData } from '../queue.service';

@Processor(QUEUES.NOTIFICATIONS, { blockingTimeout: 30000 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job<NotificationJobData>): Promise<any> {
    this.logger.log(`Processing ${job.name} for tenant ${job.data.tenantId}`);

    try {
      switch (job.data.type) {
        case 'email':
          return this.processEmail(job);
        case 'webhook':
          return this.processWebhook(job);
        case 'push':
          return this.processPush(job);
        default:
          throw new Error(`Unknown notification type: ${job.data.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process ${job.name}: ${error.message}`);
      throw error;
    }
  }

  private async processEmail(job: Job<NotificationJobData>): Promise<any> {
    const { tenantId, userId, payload } = job.data;
    
    this.logger.log(`Sending email notification to user ${userId} (tenant: ${tenantId})`);

    // Placeholder for email sending logic
    // In production: integrate with SendGrid, SES, etc.
    
    return {
      tenantId,
      userId,
      type: 'email',
      sentAt: new Date().toISOString(),
      status: 'sent',
    };
  }

  private async processWebhook(job: Job<NotificationJobData>): Promise<any> {
    const { tenantId, payload } = job.data;
    
    this.logger.log(`Sending webhook for tenant ${tenantId}`);

    // Placeholder for webhook delivery
    // In production: fetch webhook URL from tenant config and POST payload
    
    return {
      tenantId,
      type: 'webhook',
      deliveredAt: new Date().toISOString(),
      status: 'delivered',
    };
  }

  private async processPush(job: Job<NotificationJobData>): Promise<any> {
    const { tenantId, userId, payload } = job.data;
    
    this.logger.log(`Sending push notification to user ${userId} (tenant: ${tenantId})`);

    // Placeholder for push notification
    // In production: integrate with Firebase Cloud Messaging, OneSignal, etc.
    
    return {
      tenantId,
      userId,
      type: 'push',
      sentAt: new Date().toISOString(),
      status: 'sent',
    };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<NotificationJobData>) {
    this.logger.log(`Notification job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJobData>, error: Error) {
    this.logger.error(`Notification job ${job.id} failed: ${error.message}`);
  }
}
