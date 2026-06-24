import { IsString, IsBoolean, IsArray, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// NOTE : ce DTO ne sert qu'à DOCUMENTER (Swagger) la forme connue du snapshot.
// Le endpoint PUT stocke `state` comme un blob jsonb OPAQUE (cf.
// docs/restockState.api.md) : il n'applique PAS ce DTO en validation stricte,
// afin de tolérer l'ajout de futurs champs côté front sans renvoyer 400, et de
// ne pas figer les énumérations (ex. objectiveSource = 'prediction').
export class RestockStateDto {
  @ApiProperty({ description: "Source de l'objectif (ex. 'sales' | 'prediction' | 'forecast')", example: 'sales' })
  @IsString()
  objectiveSource: string;

  @ApiPropertyOptional({ nullable: true, description: 'Event de référence (mode Ventes)' })
  @IsOptional()
  @IsString()
  referenceEventId: string | null;

  @ApiProperty({ type: [String], description: 'Events sélectionnés' })
  @IsArray()
  @IsString({ each: true })
  selectedEventIds: string[];

  @ApiProperty({ type: 'object', description: 'Ajustements de stock par clé' })
  @IsObject()
  stockAdjustments: Record<string, number>;

  @ApiProperty({ type: 'object', description: 'Mode emballé/vrac par item' })
  @IsObject()
  stockPackedModes: Record<string, unknown>;

  @ApiProperty({ type: 'object', description: 'Lignes confirmées' })
  @IsObject()
  restockedRows: Record<string, unknown>;

  @ApiProperty({ description: 'Le tableau de réarmement a été figé' })
  @IsBoolean()
  restockGenerated: boolean;

  @ApiProperty({ description: 'La feuille de course a été générée' })
  @IsBoolean()
  shoppingGenerated: boolean;

  @ApiProperty({ description: "Mode de vue (ex. 'shop' | 'item')", example: 'shop' })
  @IsString()
  restockViewMode: string;
}
