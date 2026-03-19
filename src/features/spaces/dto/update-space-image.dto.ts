import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateSpaceImageDto {
  @ApiProperty({ description: 'URL de l’image de l’espace', example: 'https://cdn.example.com/spaces/space-1.jpg' })
  @IsString()
  image: string;
}
