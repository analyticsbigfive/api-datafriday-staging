import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class GrantSpaceAccessDto {
  @ApiPropertyOptional({ description: 'Rôle de l’utilisateur sur cet espace', enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
