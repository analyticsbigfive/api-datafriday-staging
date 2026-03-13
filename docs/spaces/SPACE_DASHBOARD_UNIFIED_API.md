# Space Dashboard — Unified API (Weezevent-backed, < 1s)

## Goal
Deliver a single backend API call per space that returns all data required for the Space detail “Analyse/Dashboard” UI, with **P95 latency < 1s**.

Constraints:
- **Source of truth**: Weezevent data already synced into our database (no Weezevent API calls at request time).
- **Revenue**: **HT**.
- “Shop” grouping must support **both** Weezevent **merchant** and **location**.
- Multi-tenant isolation is mandatory.

Non-goals:
- Frontend changes.
- Real-time streaming. This is near-real-time / sync-driven.

---

## High-level architecture (fast + modular)

### Key principle
The `/dashboard` endpoint must **never** aggregate large raw tables on-demand. It must read from a **read-model (pre-aggregated tables)** + **Redis cache**.

### Components
- **Raw domain (write-model)**
  - Existing Prisma models: `WeezeventTransaction`, `WeezeventTransactionItem`, `WeezeventPayment`, `WeezeventEvent`, `WeezeventMerchant`, `WeezeventLocation`, `WeezeventProduct`, `WeezeventProductMapping`, etc.
  - Filled by existing sync services (e.g. `WeezeventSyncService`, `WeezeventIncrementalSyncService`).

- **Mapping domain** (required to connect Weezevent → Space Builder)
  - `WeezeventLocation` → `Space`
  - `WeezeventMerchant` → `SpaceElement` (shop)
  - `WeezeventProduct` → `MenuItem` (via `WeezeventProductMapping`)

- **Analytics read-model** (pre-aggregated)
  - Tables optimized for dashboard reads (daily/monthly buckets).

- **Async aggregation jobs**
  - Triggered after sync and/or scheduled.
  - Compute/update read-model from raw tables.

- **Redis cache**
  - Cache final dashboard payload per `(tenantId, spaceId, filters)`.
  - Stale-while-revalidate (SWR) to maintain < 1s during refresh.

---

## Unified API surface

### 1) Main endpoint (single call)
`GET /api/v1/spaces/:spaceId/dashboard`

#### Query params
- `from` (ISO date) — optional
- `to` (ISO date) — optional
- `configId` — optional
- `granularity=day|week|month` — optional, default `day`
- `include=kpis,charts,lists,filters,space` — optional; default all

Notes:
- `spaceId` must belong to the authenticated user’s tenant.
- `from/to` define a closed/open convention; choose one and keep consistent.

#### Response (contract)
```json
{
  "meta": {
    "spaceId": "...",
    "tenantId": "...",
    "from": "2026-01-01",
    "to": "2026-01-31",
    "granularity": "day",
    "filtersHash": "...",
    "analyticsVersion": 12,
    "generatedAt": "2026-03-12T00:00:00.000Z",
    "cache": { "hit": true, "ttlSeconds": 120 }
  },
  "space": {
    "id": "...",
    "name": "...",
    "timezone": "Europe/Paris",
    "configs": [{ "id": "...", "name": "...", "capacity": 0 }]
  },
  "filters": {
    "events": [{ "id": "...", "name": "...", "startDate": "..." }],
    "shops": [{ "spaceElementId": "...", "name": "..." }],
    "weezevent": {
      "locations": [{ "weezeventLocationId": "...", "name": "..." }],
      "merchants": [{ "weezeventMerchantId": "...", "name": "..." }]
    }
  },
  "kpis": {
    "revenueHt": 0,
    "transactions": 0,
    "avgTicketHt": 0,
    "attendees": 0,
    "revenuePerAttendee": 0,
    "conversionRate": 0,
    "topSellingCategory": "...",
    "refundRate": 0
  },
  "charts": {
    "revenueOverTime": {
      "labels": ["2026-01-01"],
      "series": [{ "key": "total", "label": "Total", "values": [0] }]
    },
    "revenueByShopOverTime": {
      "labels": ["2026-01-01"],
      "series": [{ "key": "shop:...", "label": "Shop A", "values": [0] }]
    }
  },
  "lists": {
    "topShops": [{ "spaceElementId": "...", "revenueHt": 0 }],
    "topProducts": [{ "weezeventProductId": "...", "revenueHt": 0 }]
  }
}
```

### 2) Supporting endpoints (optional but recommended)
These can be internal-only initially.

- `GET /api/v1/spaces/:spaceId/dashboard/filters`
  - Return filter options only (events, shops, merchants/locations, etc.)

- `POST /api/v1/spaces/:spaceId/dashboard/rebuild`
  - Trigger async rebuild of read-model + cache invalidation/version bump.
  - Should be restricted (admin/system).

- `POST /api/v1/spaces/:spaceId/dashboard/invalidate`
  - Force cache invalidation without rebuild.
  - Returns: `{ invalidated: true, cacheKeys: [...] }`

- `GET /api/v1/spaces/:spaceId/dashboard/health`
  - Returns aggregation health status.
  - Response:
    ```json
    {
      "lastAggregationAt": "2026-03-12T15:30:00Z",
      "dataFreshnessMinutes": 5,
      "missingMappingsCount": {
        "locations": 0,
        "merchants": 2,
        "products": 15
      },
      "aggregationStatus": "healthy|degraded|error",
      "lastError": null
    }
    ```

---

## Mapping domain (required models)

### A) Weezevent Location → Space mapping
**Purpose**: assign Weezevent sales data to a `Space`.

Proposed model: `WeezeventLocationSpaceMapping`
- `id`
- `tenantId`
- `weezeventLocationId` (FK to `WeezeventLocation`)
- `spaceId` (FK to `Space`)
- Unique index: `(tenantId, weezeventLocationId)`
- Index: `(tenantId, spaceId)`

### B) Weezevent Merchant → SpaceElement (shop) mapping
**Purpose**: group revenue by shop element in Space Builder.

Proposed model: `WeezeventMerchantElementMapping`
- `id`
- `tenantId`
- `weezeventMerchantId` (FK to `WeezeventMerchant`)
- `spaceElementId` (FK to `SpaceElement`)  
- Unique index: `(tenantId, weezeventMerchantId)`
- Index: `(tenantId, spaceElementId)`

### C) Weezevent Product → MenuItem mapping
Use existing `WeezeventProductMapping` (verify actual fields).

---

## Analytics read-model (pre-aggregations)

### Why
To guarantee < 1s, the dashboard must read already-aggregated facts.

### Granularities
- **Daily** for charts and short ranges.
- **Monthly** optional for long ranges.

### Proposed tables

#### 1) `SpaceRevenueDailyAgg`
- `id`
- `tenantId`
- `spaceId`
- `day` (date)
- `weezeventEventId` (nullable)
- `weezeventLocationId` (nullable)
- `weezeventMerchantId` (nullable)
- `spaceElementId` (nullable; resolved via merchant mapping)
- `revenueHt` (decimal)
- `transactionsCount` (int)
- `itemsCount` (int)

Indexes:
- `(tenantId, spaceId, day)`
- `(tenantId, spaceId, spaceElementId, day)`
- `(tenantId, spaceId, weezeventLocationId, day)`
- `(tenantId, spaceId, weezeventMerchantId, day)`

#### 2) `SpaceProductRevenueDailyAgg`
- `id`
- `tenantId`
- `spaceId`
- `day`
- `weezeventProductId`
- `revenueHt`
- `quantity`

Index:
- `(tenantId, spaceId, day)`
- `(tenantId, spaceId, weezeventProductId, day)`

#### 3) `SpaceDashboardVersion`
- `spaceId` (unique)
- `tenantId`
- `version` (int)
- `updatedAt`

Purpose: cache invalidation by version.

---

## Aggregation jobs

### Trigger points
- After transactions sync completes for a tenant (full or incremental).
- Webhook-driven single-transaction sync should enqueue a small rebuild for affected day.

### Job types
- `rebuild-space-aggregates`
  - inputs: `tenantId`, `spaceId`, `from`, `to` (optional)

- `rebuild-tenant-aggregates`
  - inputs: `tenantId`, `from`, `to`

### Algorithm outline
1. Identify affected raw transactions window (by `transactionDate`).
2. Join raw tables:
   - `WeezeventTransaction` → `WeezeventTransactionItem` → `WeezeventPayment`
   - Also use `WeezeventTransaction.locationId`, `merchantId`, `eventId`
3. Map to `spaceId` via `WeezeventLocationSpaceMapping`.
4. Map to `spaceElementId` via `WeezeventMerchantElementMapping`.
5. Compute revenue HT:
   - If raw includes HT directly, use it.
   - Otherwise derive from payment amount + VAT rules, consistently.
6. Upsert into daily aggregate tables.
7. Increment `SpaceDashboardVersion.version` per updated space.
8. Optionally warm Redis cache.

Important:
- Prefer SQL aggregation (`GROUP BY`) and `INSERT ... ON CONFLICT DO UPDATE`.
- Avoid loading large raw datasets into Node.

---

## Redis caching strategy (SWR)

### Cache keys
`dash:v1:{tenantId}:{spaceId}:{from}:{to}:{granularity}:{include}:{filtersHash}:{version}`

### TTL
- Typical: 60s–300s.

### Stale-While-Revalidate
- If cache exists but expired:
  - return stale result immediately
  - enqueue a refresh job

### Observability
Return meta flags:
- `cache.hit`
- `cache.ttlSeconds`
- `meta.generatedAt`

---

## Indexing & performance notes

### Raw tables
Ensure indexes exist on:
- `WeezeventTransaction(tenantId, transactionDate)`
- `WeezeventTransaction(tenantId, locationId)`
- `WeezeventTransaction(tenantId, merchantId)`
- `WeezeventTransaction(tenantId, eventId)`

### Read-model tables
As listed above; the most important is `(tenantId, spaceId, day)`.

### P95 budget guidance
- Redis hit: 10–30ms
- Cache miss, read-model: 100–400ms typical
- Avoid raw aggregation at request time.

---

## Rollout plan

### Phase 1 — Data mapping
- Implement `WeezeventLocationSpaceMapping` CRUD.
- Implement `WeezeventMerchantElementMapping` CRUD.
- Ensure `WeezeventProductMapping` is present and usable.

### Phase 2 — Aggregates + jobs
- Create read-model tables.
- Implement aggregator job (tenant and/or space scope).
- Implement version bump.

### Phase 3 — Unified dashboard endpoint
- Implement `/spaces/:spaceId/dashboard` reading read-model.
- Add Redis caching.

### Phase 4 — Backward compatibility (optional)
- Either:
  - keep legacy endpoints as thin wrappers over the dashboard/read-model, or
  - migrate frontend to use the unified endpoint only.

---

## Security
- All endpoints must use JWT guard.
- All queries must filter by `tenantId`.
- Never expose Weezevent secrets.

---

## Revenue HT calculation

### Formula
When raw data contains only TTC (price including VAT):

```typescript
HT = TTC / (1 + VAT_RATE)
```

### VAT rate determination
1. **Primary source**: `WeezeventProduct.vatRate` (if available)
2. **Fallback**: `WeezeventTransaction.vatRate` or tenant default
3. **Default**: 20% (France standard rate)

### Implementation requirements
- Store `vatRate` in `WeezeventTransaction` during sync
- Create `TenantVatConfig` table for tenant-specific defaults:
  ```typescript
  {
    tenantId: string,
    defaultVatRate: decimal,
    countryCode: string,
    effectiveFrom: date
  }
  ```
- Add validation: `vatRate` must be between 0 and 100
- Log warnings when VAT rate is missing (use default)

### Edge cases
- **Mixed VAT rates in transaction**: calculate HT per item, then sum
- **VAT-exempt products**: `vatRate = 0`, `HT = TTC`
- **Refunds**: preserve original VAT rate, negate amounts

---

## Timezone handling

### Principle
All aggregations use **Space timezone** for day bucketing, not UTC.

### Implementation
1. **Storage**: `transactionDate` in raw tables is stored in UTC
2. **Conversion**: When aggregating, convert to space timezone:
   ```sql
   -- PostgreSQL example
   DATE(transaction_date AT TIME ZONE 'UTC' AT TIME ZONE space.timezone) AS day
   ```
3. **Consistency**: All `day` fields in aggregate tables represent dates in space timezone

### Required fields
- Add `timezone` to `Space` model (default: 'Europe/Paris')
- Store `timezone` in `SpaceRevenueDailyAgg` for audit/debugging

### Edge cases
- **DST transitions**: Use PostgreSQL `AT TIME ZONE` which handles DST automatically
- **Timezone changes**: Rebuild aggregates if space timezone is updated
- **Multi-location spaces**: Use primary location timezone or space-level override

---

## Data consistency & error handling

### Aggregation job tracking
Create `AggregationJobLog` table:
```typescript
{
  id: string,
  tenantId: string,
  spaceId: string | null,  // null = tenant-wide
  jobType: 'full' | 'incremental' | 'rebuild',
  status: 'pending' | 'running' | 'completed' | 'failed',
  fromDate: date,
  toDate: date,
  transactionsProcessed: int,
  startedAt: timestamp,
  completedAt: timestamp | null,
  error: string | null,
  retryCount: int,
  metadata: jsonb  // { triggeredBy, duration, rowsAffected }
}
```

Indexes:
- `(tenantId, status, startedAt)`
- `(spaceId, status)`

### Retry strategy
- **Max retries**: 3
- **Backoff**: exponential (1min, 5min, 15min)
- **Dead letter queue**: Failed jobs after max retries → alert admin
- **Idempotency**: Use `INSERT ... ON CONFLICT DO UPDATE` for safe retries

### Monitoring & alerts
- Alert if aggregation fails 3 times consecutively
- Alert if last successful aggregation > 2 hours old
- Alert if missing mappings > 10% of transactions

### Partial failure handling
- If aggregation fails for one space, continue with others
- Log failed space IDs for manual review
- Implement "skip and continue" mode for corrupted data

---

## Handling missing/unmapped data

### Strategy
Do NOT ignore unmapped data. Track and report it.

### Implementation

#### 1) Unmapped locations
- **Behavior**: Transactions with unmapped `locationId` are NOT included in any space aggregates
- **Tracking**: Increment counter in `UnmappedDataMetrics` table
- **Admin UI**: Show list of unmapped locations with transaction counts
- **Auto-suggestion**: Suggest space mapping based on event name similarity

#### 2) Unmapped merchants
- **Behavior**: Revenue is aggregated at space level but NOT attributed to any shop
- **Display**: Show in dashboard as "Non attribué" category
- **Tracking**: Store in aggregate with `spaceElementId = null`

#### 3) Unmapped products
- **Behavior**: Include in total revenue but exclude from product rankings
- **Display**: Show count of unmapped products in health endpoint

#### 4) Missing data fields
- `transactionDate = null`: Skip transaction, log error
- `amount = null or 0`: Include with 0 revenue
- `merchantId = null`: Treat as unmapped merchant

### UnmappedDataMetrics table
```typescript
{
  id: string,
  tenantId: string,
  entityType: 'location' | 'merchant' | 'product',
  entityId: string,
  entityName: string,
  transactionCount: int,
  revenueHt: decimal,
  firstSeenAt: timestamp,
  lastSeenAt: timestamp
}
```

---

## Observability & monitoring

### Metrics (Prometheus/DataDog)

#### API metrics
- `dashboard_request_duration_seconds` (histogram, P50/P95/P99)
- `dashboard_cache_hit_rate` (gauge)
- `dashboard_requests_total` (counter, by tenant, cache status)
- `dashboard_errors_total` (counter, by error type)

#### Aggregation metrics
- `aggregation_job_duration_seconds` (histogram)
- `aggregation_transactions_processed_total` (counter)
- `aggregation_job_failures_total` (counter, by reason)
- `aggregation_lag_minutes` (gauge, time since last successful run)

#### Data quality metrics
- `unmapped_locations_total` (gauge)
- `unmapped_merchants_total` (gauge)
- `unmapped_products_total` (gauge)
- `missing_vat_rate_transactions_total` (counter)

### Logging strategy

#### Request logging
```typescript
{
  level: 'info',
  message: 'Dashboard request',
  tenantId,
  spaceId,
  filters: { from, to, granularity },
  cacheHit: boolean,
  duration: ms,
  resultSize: bytes
}
```

#### Slow query logging
- Log any request > 500ms at WARN level
- Include query plan for requests > 1s

#### Error logging
```typescript
{
  level: 'error',
  message: 'Aggregation job failed',
  tenantId,
  spaceId,
  jobId,
  error: { message, stack },
  retryCount,
  metadata: { transactionsProcessed, failedAt }
}
```

### Distributed tracing
- Use OpenTelemetry for request tracing
- Trace spans:
  - `dashboard.request`
  - `dashboard.cache.check`
  - `dashboard.db.query`
  - `dashboard.compute`
  - `aggregation.job`

### Dashboards

#### Operations dashboard
- API latency (P50/P95/P99) over time
- Cache hit rate
- Error rate
- Requests per minute by tenant

#### Data quality dashboard
- Unmapped entities count
- Aggregation lag
- Failed jobs count
- Missing data percentage

---

## Testing strategy

### Unit tests

#### Revenue calculation
```typescript
describe('Revenue HT calculation', () => {
  it('should calculate HT from TTC with 20% VAT', () => {
    expect(calculateHT(120, 0.20)).toBe(100);
  });
  
  it('should handle VAT-exempt products', () => {
    expect(calculateHT(100, 0)).toBe(100);
  });
  
  it('should handle refunds with negative amounts', () => {
    expect(calculateHT(-120, 0.20)).toBe(-100);
  });
});
```

#### Timezone conversion
```typescript
describe('Timezone bucketing', () => {
  it('should bucket transaction to correct day in Paris timezone', () => {
    const utcDate = '2026-03-12T23:30:00Z';
    const day = bucketToDay(utcDate, 'Europe/Paris');
    expect(day).toBe('2026-03-13'); // Next day in Paris
  });
});
```

### Integration tests

#### Aggregation job
```typescript
describe('Aggregation job', () => {
  it('should aggregate transactions correctly', async () => {
    // Given: 10 transactions for space X on 2026-03-12
    await seedTransactions(spaceId, '2026-03-12', 10, { revenueHt: 100 });
    
    // When: Run aggregation
    await runAggregationJob({ spaceId, from: '2026-03-12', to: '2026-03-12' });
    
    // Then: Aggregate should show 1000 HT
    const agg = await getAggregate(spaceId, '2026-03-12');
    expect(agg.revenueHt).toBe(1000);
    expect(agg.transactionsCount).toBe(10);
  });
  
  it('should handle unmapped merchants gracefully', async () => {
    // Test unmapped merchant scenario
  });
  
  it('should be idempotent', async () => {
    // Run twice, verify same result
  });
});
```

### Performance tests

#### Load testing
```bash
# Target: P95 < 1s with 100 concurrent requests
k6 run --vus 100 --duration 5m dashboard-load-test.js
```

#### Test scenarios
1. **Cold cache**: First request after cache clear
2. **Warm cache**: Subsequent requests
3. **Large dataset**: Space with 1M+ transactions
4. **Complex filters**: Multiple events + shops + date range

#### Success criteria
- P95 latency < 1000ms (cold cache < 1500ms acceptable)
- P99 latency < 2000ms
- Error rate < 0.1%
- Cache hit rate > 80% in production

### Regression tests

#### Data integrity
- Compare aggregated revenue with raw transaction sum
- Verify no transactions are lost during aggregation
- Check mapping consistency

#### Backward compatibility
- Ensure legacy endpoints still work during migration
- Verify data format matches frontend expectations

---

## Security & rate limiting

### Authentication & authorization
- **JWT validation**: All endpoints require valid JWT
- **Tenant isolation**: Enforce `tenantId` filter in all queries
- **RBAC**: Role-based access control
  - `viewer`: Read-only access to dashboard
  - `admin`: Can trigger rebuilds and invalidate cache
  - `system`: Internal service access

### Rate limiting

#### Per-tenant limits
```typescript
{
  'dashboard.read': {
    points: 100,      // requests
    duration: 60,     // seconds
    blockDuration: 60 // seconds
  },
  'dashboard.rebuild': {
    points: 5,
    duration: 3600
  }
}
```

#### Implementation
- Use Redis for distributed rate limiting
- Return `429 Too Many Requests` with `Retry-After` header
- Whitelist internal services

### Data privacy
- Never expose Weezevent API keys or secrets
- Redact sensitive data in logs (PII, payment details)
- Implement audit trail for admin actions

### Input validation
- Validate date ranges (max 2 years)
- Sanitize `spaceId` parameter (UUID format)
- Reject malformed filter parameters

---

## Migration & rollback strategy

### Pre-migration checklist
1. ✅ All mapping tables created and indexed
2. ✅ Initial mappings populated (via admin UI or script)
3. ✅ Read-model tables created
4. ✅ First full aggregation completed successfully
5. ✅ Cache warming completed
6. ✅ Performance tests passed
7. ✅ Monitoring dashboards deployed

### Migration script

#### Step 1: Populate initial mappings
```sql
-- Auto-map locations to spaces based on existing data
INSERT INTO "WeezeventLocationSpaceMapping" (tenant_id, weezevent_location_id, space_id)
SELECT DISTINCT 
  t.tenant_id,
  t.location_id,
  -- Logic to infer space from event or manual mapping table
FROM "WeezeventTransaction" t
WHERE NOT EXISTS (
  SELECT 1 FROM "WeezeventLocationSpaceMapping" m 
  WHERE m.weezevent_location_id = t.location_id
);
```

#### Step 2: Initial aggregation
```bash
# Run for last 2 years of data
node scripts/initial-aggregation.js --from=2024-01-01 --to=2026-03-12
```

#### Step 3: Verify data integrity
```sql
-- Compare aggregated vs raw totals
SELECT 
  'raw' as source,
  SUM(amount_ht) as total
FROM "WeezeventTransaction"
WHERE tenant_id = 'xxx'
UNION ALL
SELECT 
  'aggregated' as source,
  SUM(revenue_ht) as total
FROM "SpaceRevenueDailyAgg"
WHERE tenant_id = 'xxx';
-- Should match within 0.01% tolerance
```

### Feature flag strategy

```typescript
const USE_UNIFIED_DASHBOARD = process.env.FEATURE_UNIFIED_DASHBOARD === 'true';

if (USE_UNIFIED_DASHBOARD) {
  return dashboardService.getUnifiedDashboard(spaceId, filters);
} else {
  return legacyDashboardService.getDashboard(spaceId, filters);
}
```

### Rollout phases

#### Phase 0: Prototyping (1 week)
- Select 1-2 pilot tenants with moderate data volume
- Run aggregation jobs
- Validate performance and data accuracy
- Collect feedback on data quality

#### Phase 1: Shadow mode (1 week)
- Run unified API in parallel with legacy
- Compare responses (log differences)
- Monitor performance metrics
- Do NOT serve to frontend yet

#### Phase 2: Canary deployment (1 week)
- Enable for 10% of tenants via feature flag
- Monitor error rates and latency
- Collect user feedback
- Gradual rollout: 10% → 25% → 50% → 100%

#### Phase 3: Full migration
- Enable for all tenants
- Keep legacy endpoints for 1 month (deprecation period)
- Monitor for issues

### Rollback procedure

#### If P95 > 1.5s or error rate > 1%
1. Disable feature flag immediately
2. Revert to legacy endpoints
3. Investigate root cause
4. Fix and re-test in staging

#### If data inconsistencies detected
1. Pause aggregation jobs
2. Identify affected date ranges
3. Rebuild aggregates for affected periods
4. Verify with raw data comparison

#### Emergency rollback script
```bash
#!/bin/bash
# Disable unified dashboard for all tenants
redis-cli SET feature:unified-dashboard:enabled false
redis-cli DEL "dash:v1:*"  # Clear all cache
echo "Rolled back to legacy dashboard"
```

---

## Performance optimization checklist

### Database
- [ ] All indexes created as specified
- [ ] Table partitioning by `tenant_id` and/or `day` (if > 10M rows)
- [ ] `VACUUM ANALYZE` scheduled weekly
- [ ] Connection pooling configured (min: 10, max: 50)
- [ ] Slow query log enabled (> 500ms)

### Redis
- [ ] Cache eviction policy: `allkeys-lru`
- [ ] Max memory: 4GB minimum
- [ ] Persistence: RDB snapshots every 5 minutes
- [ ] Separate Redis instance for cache vs rate limiting

### Application
- [ ] Enable gzip compression for API responses
- [ ] Use streaming for large result sets
- [ ] Implement request coalescing (deduplicate identical concurrent requests)
- [ ] Use database read replicas for dashboard queries

### Aggregation jobs
- [ ] Run during off-peak hours (2-6 AM)
- [ ] Process in batches of 10k transactions
- [ ] Use bulk inserts (`COPY` or multi-row `INSERT`)
- [ ] Parallel processing for multiple spaces (max 5 concurrent)

---

## Open items to confirm during implementation
- ~~Exact formula for **HT** if raw is TTC-only.~~ ✅ Documented above
- ~~Timezone normalization for day bucketing (`space.timezone`).~~ ✅ Documented above
- Canonical shop identity: merchant vs location vs merged (we support both; need UI decision for primary grouping).
- Cache warm-up strategy: pre-compute common filter combinations?
- WebSocket notifications for real-time dashboard updates?
