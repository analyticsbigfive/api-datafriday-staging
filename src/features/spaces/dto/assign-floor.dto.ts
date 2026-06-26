import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Zones non numériques acceptées par `assign-floor` en plus d'un niveau d'étage entier.
 * Partagé entre le DTO (validation) et le service (branchement).
 */
export const ASSIGN_FLOOR_ZONES = ['forecourt', 'externalmerch'] as const;
export type AssignFloorZone = (typeof ASSIGN_FLOOR_ZONES)[number];
export type AssignFloorLevel = number | AssignFloorZone;

/**
 * `level` doit être SOIT un entier (étage / sous-sol, y compris 0 et négatifs),
 * SOIT l'une des zones de `ASSIGN_FLOOR_ZONES`. class-validator n'a pas de
 * décorateur d'union (`@IsUnion` n'existe pas) → validateur custom dédié.
 */
@ValidatorConstraint({ name: 'isFloorLevelOrZone', async: false })
export class IsFloorLevelOrZone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value === 'number') return Number.isInteger(value);
    if (typeof value === 'string') return (ASSIGN_FLOOR_ZONES as readonly string[]).includes(value);
    return false;
  }

  defaultMessage(_args: ValidationArguments): string {
    return `level doit être un entier (étage/sous-sol) ou l'une des zones: ${ASSIGN_FLOOR_ZONES.join(', ')}`;
  }
}

export class AssignElementsToFloorDto {
  @ApiProperty({
    description: 'IDs des SpaceElements (shops) à assigner',
    type: [String],
    example: ['elem-abc123', 'elem-def456'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  elementIds: string[];

  @ApiProperty({
    description:
      "Niveau d'étage (entier, ex. 0=RDC, 1=Étage 1, -1=Sous-sol 1) OU une zone: 'forecourt' / 'externalmerch'",
    oneOf: [
      { type: 'integer', example: 1 },
      { type: 'string', enum: [...ASSIGN_FLOOR_ZONES] },
    ],
    example: 0,
  })
  @Validate(IsFloorLevelOrZone)
  level: AssignFloorLevel;
}
