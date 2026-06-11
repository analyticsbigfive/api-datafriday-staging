import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Rôle effectif de l'utilisateur, résolu lors du lookup JWT-DB.
 * `systemKey` retombe sur le champ legacy `User.role` (enum) si l'utilisateur
 * n'a pas encore de `Role` dynamique assigné (roleId null).
 */
export interface CurrentUserRole {
  id: string | null;
  name: string | null;
  systemKey: UserRole | null;
  isSystem: boolean;
  permissions: string[];
}

export interface CurrentUserTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

export interface CurrentUserData {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  tenantId: string | null;
  tenant: CurrentUserTenant | null;
  role: CurrentUserRole;
  isOwner: boolean;
}

/**
 * Decorator to extract current user from request
 * Usage: @CurrentUser() user: CurrentUserData
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
