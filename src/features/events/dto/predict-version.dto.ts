import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreatePredictVersionDto {
  @ApiProperty({ description: 'Nom de la version de prédiction' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'ID de l\'espace associé' })
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Version par défaut ?', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ description: 'Snapshot de l\'événement au moment de la sauvegarde', type: 'object' })
  @IsObject()
  eventSnapshot: Record<string, any>;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalRevenue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  adjustedTotalRevenue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  perCapita?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  adjustedPerCapita?: number;

  @ApiPropertyOptional({ description: 'Configuration du menu (menuConfig)', type: 'object' })
  @IsOptional()
  @IsObject()
  menuConfig?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Ajustements de quantité', type: 'object' })
  @IsOptional()
  @IsObject()
  quantityAdjustments?: Record<string, any>;

  @ApiPropertyOptional({ description: 'IDs des événements de prédiction sélectionnés', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPredictionEventIds?: string[];

  @ApiPropertyOptional({ description: 'Plage horaire sélectionnée { start, end } ou null pour effacer' })
  @IsOptional()
  @ValidateIf((o) => o.selectedTimeRange !== null)
  @IsObject()
  selectedTimeRange?: { start: string | null; end: string | null } | null;
}

export class UpdatePredictVersionDto extends CreatePredictVersionDto {}

export class PatchPredictVersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  eventSnapshot?: Record<string, any>;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalRevenue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  adjustedTotalRevenue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  perCapita?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  adjustedPerCapita?: number;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  menuConfig?: Record<string, any>;

  @ApiPropertyOptional({ type: 'object' })
  @IsOptional()
  @IsObject()
  quantityAdjustments?: Record<string, any>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPredictionEventIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o) => o.selectedTimeRange !== null)
  @IsObject()
  selectedTimeRange?: { start: string | null; end: string | null } | null;
}

export class SetDefaultVersionDto {
  @ApiPropertyOptional({ description: 'ID de la version à passer en default, null pour retirer le défaut', nullable: true })
  @IsOptional()
  @IsString()
  versionId?: string | null;
}
