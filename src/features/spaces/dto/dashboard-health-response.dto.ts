export interface MissingMappingsCountDto {
  locations: number;
  merchants: number;
  products: number;
}

export enum AggregationStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  ERROR = 'error',
}

export interface DashboardHealthResponseDto {
  lastAggregationAt: string | null;
  dataFreshnessMinutes: number | null;
  missingMappingsCount: MissingMappingsCountDto;
  aggregationStatus: AggregationStatus;
  lastError: string | null;
}
