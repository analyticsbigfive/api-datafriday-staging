import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class JoinTenantDto {
  @ApiPropertyOptional({ description: 'Prénom de l’utilisateur', example: 'Jean' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ description: 'Nom de l’utilisateur', example: 'Dupont' })
  @IsOptional()
  @IsString()
  lastName?: string;
}
