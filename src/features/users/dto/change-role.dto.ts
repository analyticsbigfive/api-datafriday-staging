import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class ChangeRoleDto {
  @ApiProperty({
    description: 'Nouveau rôle à attribuer',
    enum: UserRole,
  })
  @IsEnum(UserRole)
  role: UserRole;
}
