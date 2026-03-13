import { PartialType } from '@nestjs/swagger';
import { CreateEventSubcategoryDto } from './create-event-subcategory.dto';

export class UpdateEventSubcategoryDto extends PartialType(CreateEventSubcategoryDto) {}
