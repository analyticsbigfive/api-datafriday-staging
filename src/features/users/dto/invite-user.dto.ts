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
    description: 'Rôle à attribuer',
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
