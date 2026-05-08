import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, IsBoolean, IsArray } from 'class-validator';

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
  @ApiPropertyOptional() @IsOptional() @IsArray() sessions?: any[];
  @ApiPropertyOptional() @IsOptional() @IsInt() numberOfSessions?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasOpeningAct?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasIntermission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eventStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() eventEndDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() eventEndTime?: string;
}
