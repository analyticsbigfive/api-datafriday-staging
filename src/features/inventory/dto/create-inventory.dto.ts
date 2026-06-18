import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateInventoryDto {
  @ApiProperty({ description: 'ID de l\'espace' })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({ description: 'ID de l\'événement (optionnel, upsert sur spaceId+eventId)' })
  @IsOptional()
  @IsString()
  eventId?: string;
}
