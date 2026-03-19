import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InvalidateCacheDto {
  @ApiProperty({ description: 'ID du tenant', example: 'tenant-123' })
  @IsString()
  tenantId: string;

  @ApiPropertyOptional({ description: 'ID de l’espace ciblé', example: 'space-123' })
  @IsOptional()
  @IsString()
  spaceId?: string;
}
