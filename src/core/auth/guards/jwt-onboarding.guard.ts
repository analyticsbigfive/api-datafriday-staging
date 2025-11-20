import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * JWT Onboarding Guard
 * Uses 'jwt-onboarding' strategy which allows missing org_id
 */
@Injectable()
export class JwtOnboardingGuard extends AuthGuard('jwt-onboarding') {
    canActivate(
        context: ExecutionContext,
    ): boolean | Promise<boolean> | Observable<boolean> {
        return super.canActivate(context);
    }
}
