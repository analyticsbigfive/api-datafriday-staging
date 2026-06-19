import { IsEmail, IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
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
    description: 'Rôle de l\'utilisateur',
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
}
