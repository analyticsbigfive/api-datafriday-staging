import { SetMetadata } from '@nestjs/common';

export const SPACE_ID_PARAM_KEY = 'spaceIdParam';

/**
 * Indique au SpaceAccessGuard quel paramètre de route porte l'id de l'espace.
 * Défaut (sans décorateur) : `spaceId`. Utiliser sur les contrôleurs dont la route
 * espace utilise un autre nom (ex. SpacesController qui expose `/spaces/:id`).
 *
 * Usage : `@SpaceIdParam('id')` au niveau classe ou méthode.
 */
export const SpaceIdParam = (paramName: string) =>
  SetMetadata(SPACE_ID_PARAM_KEY, paramName);
