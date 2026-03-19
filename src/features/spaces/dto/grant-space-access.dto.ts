import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export enum SpaceAccessRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
  VIEWER = 'VIEWER',
}

export class GrantSpaceAccessDto {
  @ApiProperty({ description: 'ID de l’utilisateur à autoriser', example: 'user-123' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Rôle sur l’espace', enum: SpaceAccessRole })
  @IsEnum(SpaceAccessRole)
  role: SpaceAccessRole;
}
