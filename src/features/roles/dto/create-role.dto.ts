import { IsString, IsOptional, IsArray, ArrayUnique, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Nom du rôle',
    example: 'Responsable Bar',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({
    description: 'Description du rôle',
    example: 'Gère les stocks et le menu du bar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    description: 'IDs des permissions accordées à ce rôle',
    type: [String],
    example: ['perm_xxx', 'perm_yyy'],
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionIds: string[];
}
