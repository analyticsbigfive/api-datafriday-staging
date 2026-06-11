import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class ChangeRoleDto {
  @ApiPropertyOptional({
    description:
      'ID du rôle dynamique (RBAC) à attribuer. Prioritaire sur `role` si les deux sont fournis.',
    example: 'role_xxx',
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    description:
      'Rôle legacy à attribuer (enum). Conservé pour compatibilité, ignoré si `roleId` est fourni.',
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
