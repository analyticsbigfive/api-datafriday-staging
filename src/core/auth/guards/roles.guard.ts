import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Guard for role-based access control (RBAC)
 * Checks if user has required role to access the route
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No roles required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // user.role peut être un objet { systemKey, ... } (rôle dynamique résolu via JWT-DB)
    // ou, par compatibilité, directement la valeur de l'enum UserRole.
    const systemKey = user.role?.systemKey ?? user.role;

    return requiredRoles.some((role) => systemKey === role);
  }
}
