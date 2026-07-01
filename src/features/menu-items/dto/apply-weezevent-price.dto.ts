import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsNumber, IsBoolean, ValidateNested, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Application du prix Weezevent à UN menu item. `weezeventProductId` optionnel : si l'article
 * n'a qu'un seul produit mappé, on le résout automatiquement ; sinon il faut le préciser.
 *
 * `basePrice`/`vatRate` (optionnels) = le prix DU PRODUIT TEL QU'AFFICHÉ côté front. Quand ils
 * sont fournis, le menu item HÉRITE exactement de ce prix (pas de re-calcul serveur qui pourrait
 * diverger de l'affichage). Absents → le backend dérive le prix du produit (repli).
 */
export class ApplyWeezeventPriceDto {
  @ApiPropertyOptional({
    description: 'Produit Weezevent source du prix. Optionnel si un seul produit est mappé à l’article.',
    example: 'wzp_coca_50cl',
  })
  @IsOptional()
  @IsString()
  weezeventProductId?: string;

  @ApiPropertyOptional({
    description:
      'Espace ciblé : le prix est écrit dans `spacePrices[spaceId]` (prix par espace). Absent → comportement global historique (basePrice).',
    example: 'space_terrasse',
  })
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional({ description: 'Prix TTC affiché du produit, à hériter tel quel.', example: 6.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  basePrice?: number;

  @ApiPropertyOptional({ description: 'Taux TVA % affiché du produit (null = inconnu).', example: 10 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vatRate?: number;
}

export class ApplyWeezeventPriceItemDto {
  @ApiProperty({ description: 'ID du menu item', example: 'mi_coca_50cl' })
  @IsString()
  menuItemId: string;

  @ApiPropertyOptional({
    description: 'Produit Weezevent source. Optionnel si un seul produit est mappé à l’article.',
    example: 'wzp_coca_50cl',
  })
  @IsOptional()
  @IsString()
  weezeventProductId?: string;

  @ApiPropertyOptional({ description: 'Prix TTC affiché du produit, à hériter tel quel.', example: 6.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  basePrice?: number;

  @ApiPropertyOptional({ description: 'Taux TVA % affiché du produit (null = inconnu).', example: 10 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vatRate?: number;
}

/** Application en masse (étape 3 Data Integration) : un prix Weezevent par menu item. */
export class ApplyWeezeventPricesBulkDto {
  @ApiProperty({ type: [ApplyWeezeventPriceItemDto], description: 'Articles à (re)tarifer depuis Weezevent.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ApplyWeezeventPriceItemDto)
  items: ApplyWeezeventPriceItemDto[];

  @ApiPropertyOptional({
    description:
      'Espace ciblé pour tout le lot : chaque prix est écrit dans `spacePrices[spaceId]`. Absent → comportement global (basePrice).',
    example: 'space_terrasse',
  })
  @IsOptional()
  @IsString()
  spaceId?: string;
}

/**
 * Backfill de masse : (re)tarifie tous les menu items mappés dont le prix par espace est absent/0,
 * en écrivant pour chaque (item × espace) le dernier prix de vente non nul observé DANS CET ESPACE
 * (jamais un prix d'un autre espace). Aucun body requis — tout est optionnel.
 */
export class BackfillWeezeventPricesDto {
  @ApiPropertyOptional({
    description: 'Limiter le backfill à un seul espace (sinon tous les espaces assignés aux items).',
    example: 'space_terrasse',
  })
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional({
    description:
      "Event prioritaire (WeezeventEvent.id interne). Si un produit n'a pas de vente sur cet event dans l'espace, repli sur l'espace (tous events).",
    example: 'evt_summer_2026',
  })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'Réécrire même les couples déjà tarifés (> 0). Défaut : false (idempotent).',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  overwrite?: boolean;

  @ApiPropertyOptional({
    description: 'Aperçu sans écriture : calcule le résumé (compteurs) sans modifier la base. Défaut : false.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  dryRun?: boolean;
}
