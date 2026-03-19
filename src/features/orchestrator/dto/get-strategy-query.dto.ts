import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum OrchestratorOperation {
  SYNC = 'sync',
  ANALYTICS = 'analytics',
  EXPORT = 'export',
  REPORT = 'report',
}

export enum OrchestratorPriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export class GetStrategyQueryDto {
  @ApiProperty({ description: 'ID du tenant', example: 'tenant-123' })
  @IsString()
  tenantId: string;

  @ApiProperty({ enum: OrchestratorOperation, description: 'Type d’opération à orchestrer' })
  @IsEnum(OrchestratorOperation)
  operation: OrchestratorOperation;

  @ApiPropertyOptional({ description: 'Volume estimé d’éléments à traiter', type: Number, example: 5000 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  estimatedItems?: number;

  @ApiPropertyOptional({ enum: OrchestratorPriority, description: 'Priorité métier' })
  @IsOptional()
  @IsEnum(OrchestratorPriority)
  priority?: OrchestratorPriority;
}
