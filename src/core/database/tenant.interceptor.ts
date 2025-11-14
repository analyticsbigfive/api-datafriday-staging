import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestWithTenant } from '../../shared/interfaces/tenant-aware.interface';

/**
 * Interceptor that extracts tenantId from JWT and adds it to request context
 * Enables automatic multi-tenant data isolation
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();

    // Extract tenantId from user JWT (injected by JwtGuard)
    if (request.user?.tenantId) {
      request.tenantId = request.user.tenantId;

      this.logger.debug(
        `[${request.method}] ${request.url} - Tenant: ${request.tenantId}`,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - No tenant context found`,
      );
    }

    return next.handle();
  }
}
