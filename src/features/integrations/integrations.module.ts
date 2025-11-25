import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { EncryptionModule } from '../../core/encryption/encryption.module';

@Module({
  imports: [EncryptionModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    WeezeventIntegrationService,
    WebhookIntegrationService,
  ],
  exports: [WeezeventIntegrationService, WebhookIntegrationService],
})
export class IntegrationsModule { }
