import { IsEmail, IsString, IsOptional, IsEnum, IsBoolean, IsArray, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({
    description: 'Email de l\'utilisateur',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Prénom',
    example: 'John',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @ApiProperty({
    description: 'Nom',
    example: 'Doe',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({
    description:
      "Mot de passe initial. Si omis, le compte est créé sans mot de passe (l'utilisateur devra utiliser « mot de passe oublié » ou le lien d'invitation).",
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

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
    description: 'URL de l\'avatar',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    description:
      "Donner accès à TOUS les espaces actuels de l'organisation (crée les UserSpaceAccess correspondants). Sans effet pour les rôles ADMIN/MANAGER qui voient déjà tout.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allSpaces?: boolean;

  @ApiPropertyOptional({
    description:
      "Liste d'IDs d'espaces auxquels donner accès (ignoré si `allSpaces`). Les IDs hors de l'organisation sont ignorés.",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  spaceIds?: string[];
}
