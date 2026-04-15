import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class ProcessEventsDto {
  @ApiProperty({ description: 'ID du Space' })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({ description: 'IDs des événements à traiter (tous si vide)', type: [String] })
  @IsOptional()
  @IsArray()
  eventIds?: string[];
}

export class SynchronizeDto {
  @ApiProperty({ description: 'ID du Space' })
  @IsString()
  spaceId: string;
}
