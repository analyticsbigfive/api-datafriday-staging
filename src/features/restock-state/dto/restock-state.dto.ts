import { IsString, IsBoolean, IsArray, IsObject, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RestockStateDto {
  @ApiProperty({ enum: ['sales', 'forecast'] })
  @IsString()
  @IsIn(['sales', 'forecast'])
  objectiveSource: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  referenceEventId: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  selectedEventIds: string[];

  @ApiProperty({ type: 'object' })
  @IsObject()
  stockAdjustments: Record<string, number>;

  @ApiProperty({ type: 'object' })
  @IsObject()
  stockPackedModes: Record<string, unknown>;

  @ApiProperty({ type: 'object' })
  @IsObject()
  restockedRows: Record<string, unknown>;

  @ApiProperty()
  @IsBoolean()
  restockGenerated: boolean;

  @ApiProperty()
  @IsBoolean()
  shoppingGenerated: boolean;

  @ApiProperty({ enum: ['shop', 'item'] })
  @IsString()
  @IsIn(['shop', 'item'])
  restockViewMode: string;
}
