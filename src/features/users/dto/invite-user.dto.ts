import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class InviteUserDto {
  @ApiProperty({
    description: 'Email de l\'utilisateur à inviter',
    example: 'newuser@example.com',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description: 'Prénom (pré-rempli ; sinon l\'invité le renseignera en acceptant)',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Nom (pré-rempli ; sinon l\'invité le renseignera en acceptant)',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'ID du rôle dynamique à attribuer (prioritaire sur `role`)',
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    description: 'Rôle système à attribuer (fallback si `roleId` absent)',
    enum: UserRole,
    default: UserRole.VIEWER,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole = UserRole.VIEWER;

  @ApiPropertyOptional({
    description: 'Message personnalisé pour l\'invitation',
  })
  @IsOptional()
  @IsString()
  message?: string;
}
