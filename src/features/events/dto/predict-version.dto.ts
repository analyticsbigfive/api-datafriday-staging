import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
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

  @ApiProperty({ description: 'Configuration du menu (menuConfig)', type: 'object' })
  @IsObject()
  menuConfig: Record<string, any>;

  @ApiProperty({ description: 'Ajustements de quantité', type: 'object' })
  @IsObject()
  quantityAdjustments: Record<string, any>;

  @ApiPropertyOptional({ description: 'IDs des événements de prédiction sélectionnés', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPredictionEventIds?: string[];
}

export class UpdatePredictVersionDto extends CreatePredictVersionDto {}

export class SetDefaultVersionDto {
  @ApiProperty({ description: 'ID de la version à passer en default' })
  @IsString()
  versionId: string;
}
