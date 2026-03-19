import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class MapProductToMenuItemDto {
  @ApiProperty({ description: 'ID du menu item à associer', example: 'menu-item-123' })
  @IsString()
  menuItemId: string;

  @ApiPropertyOptional({ description: 'Indique si le mapping a été créé automatiquement', example: false })
  @IsOptional()
  @IsBoolean()
  autoMapped?: boolean;

  @ApiPropertyOptional({ description: 'Score de confiance du mapping', type: Number, example: 0.92 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  confidence?: number;
}
