import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Self-service profile update. Intentionally limited to identity fields —
 * a user can NEVER change their own role/permissions/tenant here.
 */
export class UpdateMeDto {
  @ApiPropertyOptional({ description: 'Prénom', example: 'John' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Nom', example: 'Doe' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ description: "URL de l'avatar" })
  @IsOptional()
  @IsString()
  avatar?: string;
}
