import { IsOptional, IsISO8601, IsString, IsEnum, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export enum DashboardGranularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum DashboardInclude {
  KPIS = 'kpis',
  CHARTS = 'charts',
  LISTS = 'lists',
  FILTERS = 'filters',
  SPACE = 'space',
}

export class DashboardQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  configId?: string;

  @IsOptional()
  @IsEnum(DashboardGranularity)
  granularity?: DashboardGranularity = DashboardGranularity.DAY;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v) => v.trim());
    }
    return value;
  })
  include?: DashboardInclude[] = [
    DashboardInclude.KPIS,
    DashboardInclude.CHARTS,
    DashboardInclude.LISTS,
    DashboardInclude.FILTERS,
    DashboardInclude.SPACE,
  ];
}
