import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Création rapide d'un shop (SpaceElement) pour le flux d'import Weezevent.
 * `type` reste volontairement libre (string) : `mapElementType` côté service gère
 * la longue liste de préfixes (`fnb-*`, `merch-*`, `storage-*`, …) avec un fallback
 * `'other'`. Forcer un `@IsIn` court ici régresserait sur des types valides — on
 * se contente donc de garantir que `type` est une string et que `name` est non vide.
 */
export class QuickCreateElementDto {
  @ApiProperty({
    description: 'Nom du shop',
    example: 'Bar Nord',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      "Type d'élément (frontend). Ex: 'shop', 'fnb-food', 'fnb-beverages', 'fnb-bar', 'fnb-snack', 'fnb-icecream', 'merchshop'. " +
      "Mappé vers l'enum Prisma via mapElementType (fallback 'other').",
    example: 'fnb-beverages',
  })
  @IsString()
  @IsOptional()
  type?: string;
}
