import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard pour l'administration PLATEFORME (cross-tenant).
 *
 * Distinct du rôle ADMIN d'organisation : seul un utilisateur portant le flag
 * `isSuperAdmin` (résolu lors du lookup JWT-DB) peut franchir ce guard.
 *
 * À utiliser sur les surfaces qui agissent au-delà d'un seul tenant
 * (gestion de TOUS les tenants, métriques plateforme, etc.).
 *
 * Doit s'exécuter APRÈS JwtDatabaseGuard (request.user peuplé). Sur un contrôleur
 * super-admin, penser à `@AllowNoTenant()` si l'admin plateforme n'a pas de tenant
 * courant (sinon le TenantGuard global le bloquerait en amont).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.isSuperAdmin) {
      throw new ForbiddenException(
        'Réservé aux administrateurs plateforme (super-admin).',
      );
    }

    return true;
  }
}
