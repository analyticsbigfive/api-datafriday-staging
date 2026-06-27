import { IsEmail, IsEnum, IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';
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
    description: 'Téléphone de contact (pré-rempli ; optionnel)',
    example: '+33 6 12 34 56 78',
  })
  @IsOptional()
  @IsString()
  phone?: string;

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

  @ApiPropertyOptional({
    description:
      "Donner accès à TOUS les espaces actuels de l'organisation. Sans effet pour ADMIN/MANAGER (voient déjà tout).",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allSpaces?: boolean;

  @ApiPropertyOptional({
    description: "Liste d'IDs d'espaces à accorder (ignoré si `allSpaces`). IDs hors-orga ignorés.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}
