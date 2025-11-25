import {
    Controller,
    Post,
    Body,
    Param,
    Headers,
    HttpCode,
    HttpStatus,
    Logger,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';
import { WeezeventWebhookPayloadDto } from './dto/webhook-payload.dto';

@Controller('webhooks/weezevent')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly signatureService: WebhookSignatureService,
        private readonly eventHandler: WebhookEventHandler,
    ) { }

    /**
     * Receive webhook from Weezevent
     * POST /webhooks/weezevent/:tenantId
     */
    @Post(':tenantId')
    @HttpCode(HttpStatus.OK)
    async receiveWebhook(
        @Param('tenantId') tenantId: string,
        @Headers('x-weezevent-signature') signature: string,
        @Body() payload: WeezeventWebhookPayloadDto,
    ): Promise<{ received: boolean; eventId: string }> {
        this.logger.log(
            `Received webhook for tenant ${tenantId}: ${payload.type} - ${payload.method}`,
        );

        try {
            // 1. Get tenant configuration
            const tenant = await this.prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            if (!tenant) {
                throw new BadRequestException('Tenant not found');
            }

            if (!tenant.weezeventWebhookEnabled) {
                throw new UnauthorizedException('Webhooks not enabled for this tenant');
            }

            // 2. Validate signature if secret is configured
            if (tenant.weezeventWebhookSecret) {
                if (!signature) {
                    throw new UnauthorizedException('Signature header missing');
                }

                const isValid = this.signatureService.validateSignature(
                    payload,
                    signature,
                    tenant.weezeventWebhookSecret,
                );

                if (!isValid) {
                    this.logger.warn(`Invalid signature for tenant ${tenantId}`);
                    throw new UnauthorizedException('Invalid signature');
                }

                this.logger.log(`Signature validated for tenant ${tenantId}`);
            }

            // 3. Store webhook event for audit and processing
            const webhookEvent = await this.prisma.weezeventWebhookEvent.create({
                data: {
                    tenantId,
                    eventType: payload.type,
                    method: payload.method,
                    payload: payload as any,
                    signature,
                    processed: false,
                },
            });

            this.logger.log(`Stored webhook event ${webhookEvent.id}`);

            // 4. Process event asynchronously (don't wait for completion)
            // This ensures we return 200 quickly to Weezevent
            this.processEventAsync(webhookEvent.id);

            // 5. Return success immediately
            return {
                received: true,
                eventId: webhookEvent.id,
            };
        } catch (error) {
            this.logger.error(
                `Failed to receive webhook for tenant ${tenantId}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Process event asynchronously without blocking the response
     */
    private processEventAsync(eventId: string): void {
        // Use setImmediate to process in next event loop iteration
        setImmediate(async () => {
            try {
                await this.eventHandler.processEvent(eventId);
            } catch (error) {
                this.logger.error(
                    `Async processing failed for event ${eventId}`,
                    error.stack,
                );
                // Error is already logged in the database by the handler
            }
        });
    }
}
