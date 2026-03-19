import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SetPinnedSpacesDto {
  @ApiProperty({
    description: 'Liste des IDs des espaces à épingler',
    type: [String],
    example: ['space-abc123', 'space-xyz789'],
  })
  @IsArray()
  @IsString({ each: true })
  spaceIds: string[];
}
