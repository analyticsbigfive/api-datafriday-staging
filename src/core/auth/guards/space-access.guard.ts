import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SPACE_ID_PARAM_KEY } from '../decorators/space-id-param.decorator';
import { SpaceAccessService } from '../space-access.service';

/**
 * Defense-in-depth : sur toute route portant un id d'espace dans ses params
 * (`:spaceId` par défaut, ou le nom déclaré via `@SpaceIdParam(...)`), refuse l'accès
 * si l'utilisateur n'a pas le périmètre requis (cf. SpaceAccessService).
 *
 * - Routes sans param d'espace → laissées passer (le filtrage des LISTES est fait
 *   séparément dans les services).
 * - Utilisateurs à accès complet (ADMIN / super-admin / `spaces.viewAll`) → aucun coût DB.
 *
 * Enregistré globalement APRÈS JwtDatabaseGuard (request.user peuplé).
 */
@Injectable()
export class SpaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return true; // l'auth est gérée par les guards en amont

    const paramName =
      this.reflector.getAllAndOverride<string>(SPACE_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'spaceId';

    const spaceId = request.params?.[paramName];
    if (!spaceId) return true; // route non rattachée à un espace précis

    // Court-circuit sans DB pour les accès complets.
    if (this.spaceAccess.hasFullAccess(user)) return true;

    const allowed = await this.spaceAccess.canAccessSpace(user, spaceId);
    if (!allowed) {
      throw new ForbiddenException("Vous n'avez pas accès à cet espace.");
    }
    return true;
  }
}
