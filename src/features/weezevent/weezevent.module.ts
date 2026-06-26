import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WeezeventAuthService } from './services/weezevent-auth.service';
import { WeezeventApiService } from './services/weezevent-api.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { WeezeventTransactionSyncService } from './services/sync/transaction-sync.service';
import { WeezeventCatalogSyncService } from './services/sync/catalog-sync.service';
import { WeezeventQueuedEntitySyncService } from './services/sync/queued-entity-sync.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';
import { WeezeventController } from './weezevent.controller';
import { WebhookController } from './webhook.controller';
import { WeezeventAnalyticsController } from './weezevent-analytics.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PricingModule } from '../../shared/pricing/pricing.module';
import { SyncTrackerService } from './services/sync-tracker.service';
import { WeezeventCronService } from './services/weezevent-cron.service';
import { WeezeventIncrementalSyncService } from './services/weezevent-incremental-sync.service';
import { WeezeventCollectWorkerService } from './services/weezevent-collect-worker.service';
import { WeezeventInsertWorkerService } from './services/weezevent-insert-worker.service';

@Module({
    imports: [
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 5,
        }),
        OnboardingModule,
        PricingModule,
    ],
    controllers: [WeezeventController, WebhookController, WeezeventAnalyticsController],
    providers: [
        WeezeventAuthService,
        WeezeventApiService,
        WeezeventClientService,
        // Focused sub-services (SOLID / SRP)
        WeezeventTransactionSyncService,
        WeezeventCatalogSyncService,
        WeezeventQueuedEntitySyncService,
        // Thin facade — keeps backward-compat for all existing callers
        WeezeventSyncService,
        WeezeventIncrementalSyncService,
        WebhookSignatureService,
        WebhookEventHandler,
        SyncTrackerService,
        WeezeventCronService,
        WeezeventCollectWorkerService,
        WeezeventInsertWorkerService,
    ],
    exports: [
        WeezeventClientService,
        WeezeventSyncService,
        WeezeventTransactionSyncService,
        WeezeventCatalogSyncService,
        WeezeventQueuedEntitySyncService,
        WeezeventIncrementalSyncService,
        WeezeventAuthService,
    ],
})
export class WeezeventModule { }
