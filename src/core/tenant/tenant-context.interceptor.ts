import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { TENANT_ID_KEY } from './tenant-context.constants';

/**
 * Copies the authenticated tenantId (resolved by JwtDatabaseGuard) into the CLS
 * context so PrismaService can auto-scope every query for the rest of the request.
 *
 * Runs as a global interceptor: after guards (so `request.user` is populated)
 * and before the route handler. No-op for unauthenticated / public requests.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() === 'http' && this.cls.isActive()) {
      const request = context.switchToHttp().getRequest();
      const tenantId = request?.user?.tenantId;
      if (tenantId) {
        this.cls.set(TENANT_ID_KEY, tenantId);
      }
    }
    return next.handle();
  }
}
