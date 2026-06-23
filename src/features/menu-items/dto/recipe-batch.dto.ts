import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional } from 'class-validator';

export class RecipeBatchDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'IDs des menu items dont on veut la recette (réarmement multi-items). Absent/vide → tous les items du tenant.',
    example: ['mi_sandwich_americain', 'mi_water_50cl'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
