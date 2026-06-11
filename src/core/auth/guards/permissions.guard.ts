import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Guard for fine-grained permission-based access control (RBAC).
 * Complète RolesGuard pour les endpoints "fonctionnalité" optionnels.
 *
 * - Pas de métadonnée `@RequirePermissions(...)` => accès autorisé (permissif par défaut)
 * - `user.role.systemKey === ADMIN` => toujours autorisé (cf. RBAC_SYSTEM.md §3.6)
 * - Sinon, logique OR entre les codes requis et `user.role.permissions`
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Le rôle ADMIN (systemKey) a toujours toutes les permissions, quel que soit
    // le contenu de RolePermission, pour éviter un auto-verrouillage accidentel.
    if (user.role?.systemKey === UserRole.ADMIN) {
      return true;
    }

    const granted: string[] = user.role?.permissions ?? [];

    return required.some((code) => granted.includes(code));
  }
}
