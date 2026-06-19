import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateInventoryDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({ description: "ID de l'événement" })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiProperty({
    description:
      'Snapshot complet des comptages : { shopId: { itemId: { packedUnits, looseUnits, isCounted, ... } } }',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  inventoryCounts: Record<string, Record<string, any>>;
}
