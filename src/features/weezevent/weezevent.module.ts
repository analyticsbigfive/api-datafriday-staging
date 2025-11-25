import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WeezeventAuthService } from './services/weezevent-auth.service';
import { WeezeventApiService } from './services/weezevent-api.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { WeezeventSyncService } from './services/weezevent-sync.service';
import { WeezeventController } from './weezevent.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
    imports: [
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 5,
        }),
        OnboardingModule,
    ],
    controllers: [WeezeventController],
    providers: [
        WeezeventAuthService,
        WeezeventApiService,
        WeezeventClientService,
        WeezeventSyncService,
    ],
    exports: [WeezeventClientService, WeezeventSyncService],
})
export class WeezeventModule { }
