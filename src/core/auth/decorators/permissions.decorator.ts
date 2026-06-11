import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../guards/permissions.guard';

/**
 * Decorator to set required permission codes for a route.
 * Logique OR : l'utilisateur doit posséder au moins un des codes fournis.
 * Usage: @RequirePermissions('org.users.manage', 'org.users.changeRole')
 */
export const RequirePermissions = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);
