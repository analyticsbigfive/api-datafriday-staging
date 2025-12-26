import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';

export class JoinByCodeDto {
  @ApiProperty({
    description: 'Code d\'invitation fourni par l\'administrateur de l\'organisation',
    example: 'ABC12345',
    minLength: 6,
    maxLength: 12,
  })
  @IsString()
  @IsNotEmpty({ message: 'Le code d\'invitation est requis' })
  @MinLength(6)
  @MaxLength(12)
  invitationCode: string;

  @ApiPropertyOptional({
    description: 'Prénom de l\'utilisateur',
    example: 'Jean',
  })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Nom de famille de l\'utilisateur',
    example: 'Dupont',
  })
  @IsString()
  @IsOptional()
  lastName?: string;
}
