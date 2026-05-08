import { Module } from '@nestjs/common';
import { CacheService } from './cache.service';

// NOTE: @Global() intentionally removed — use RedisService for distributed cache.
// CacheService (in-process Map) is kept only for local unit testing or isolated use-cases
// where multi-pod invalidation is not needed. Import CacheModule explicitly where required.
@Module({
    providers: [CacheService],
    exports: [CacheService],
})
export class CacheModule { }
