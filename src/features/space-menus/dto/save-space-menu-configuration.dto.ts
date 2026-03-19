import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString } from 'class-validator';

export class SaveSpaceMenuConfigurationDto {
  @ApiProperty({ description: 'ID de l’espace', example: 'space-123' })
  @IsString()
  spaceId: string;

  @ApiProperty({ description: 'ID de la configuration', example: 'config-123' })
  @IsString()
  configId: string;

  @ApiProperty({
    description: 'Mapping des éléments vers les items de menu activés',
    example: {
      'element-1': { 'menu-item-1': true, 'menu-item-2': false },
      'element-2': { 'menu-item-3': true },
    },
    type: 'object',
    additionalProperties: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
    },
  })
  @IsObject()
  menuItems: Record<string, Record<string, boolean>>;
}
