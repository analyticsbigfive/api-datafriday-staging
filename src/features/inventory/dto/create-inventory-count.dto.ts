import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateInventoryCountDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({ description: "ID de l'événement" })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: 'ID du shop (SpaceElement)' })
  @IsOptional()
  @IsString()
  shopId?: string;

  @ApiProperty({ description: "ID de l'article (MenuItem ou itemId interne)" })
  @IsString()
  itemId: string;

  @ApiProperty({ description: 'Unités en carton (emballé)', type: Number })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  packedUnits: number;

  @ApiProperty({ description: "Unités à l'unité (en vrac)", type: Number })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  looseUnits: number;

  @ApiProperty({ description: 'Article coché comme compté', type: Boolean })
  @IsBoolean()
  isCounted: boolean;

  @ApiPropertyOptional({ description: 'Emplacement de stockage' })
  @IsOptional()
  @IsString()
  storageLocation?: string | null;

  @ApiPropertyOptional({
    description: 'Statut du comptage : pending | counted | skipped',
    default: 'pending',
  })
  @IsOptional()
  @IsString()
  countingStatus?: string;
}
