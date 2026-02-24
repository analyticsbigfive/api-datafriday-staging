import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, IsBoolean } from 'class-validator';

export class CreateEventDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsDateString() eventDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spaceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() configurationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventCategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventSubcategoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() spaceName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sessions?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() numberOfSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasOpeningAct?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasIntermission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
