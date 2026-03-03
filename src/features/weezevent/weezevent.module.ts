import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WeezeventAuthService } from './services/weezevent-auth.service';
import { WeezeventApiService } from './services/weezevent-api.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';
import { WeezeventController } from './weezevent.controller';
import { WebhookController } from './webhook.controller';
import { WeezeventAnalyticsController } from './weezevent-analytics.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { SyncTrackerService } from './services/sync-tracker.service';
import { WeezeventCronService } from './services/weezevent-cron.service';
import { WeezeventIncrementalSyncService } from './services/weezevent-incremental-sync.service';

@Module({
    imports: [
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 5,
        }),
        OnboardingModule,
    ],
    controllers: [WeezeventController, WebhookController, WeezeventAnalyticsController],
    providers: [
        WeezeventAuthService,
        WeezeventApiService,
        WeezeventClientService,
        WeezeventSyncService,
        WeezeventIncrementalSyncService,
        WebhookSignatureService,
        WebhookEventHandler,
        SyncTrackerService,
        WeezeventCronService,
    ],
    exports: [WeezeventClientService, WeezeventSyncService, WeezeventIncrementalSyncService],
})
export class WeezeventModule { }
