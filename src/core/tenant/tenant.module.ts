import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * Global module exposing the tenant request-context helper.
 * ClsModule itself is registered in AppModule (needs to wrap the whole app).
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantModule {}
