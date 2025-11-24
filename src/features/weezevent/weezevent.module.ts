import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WeezeventAuthService } from './services/weezevent-auth.service';
import { WeezeventApiService } from './services/weezevent-api.service';
import { WeezeventClientService } from './services/weezevent-client.service';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
    imports: [
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 5,
        }),
        OnboardingModule,
    ],
    providers: [
        WeezeventAuthService,
        WeezeventApiService,
        WeezeventClientService,
    ],
    exports: [WeezeventClientService],
})
export class WeezeventModule { }
