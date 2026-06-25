import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CurrentUserData } from './decorators/current-user.decorator';

/** Permission qui donne accès à TOUS les espaces du tenant. */
export const SPACES_VIEW_ALL = 'spaces.viewAll';

/**
 * Résout le périmètre d'espaces d'un utilisateur (cf. docs/CONCEPTION_CIBLE_AUTH.md §5).
 *
 * Règle (décision 2026-06-25) : accès complet si super-admin, ou rôle système ADMIN,
 * ou possède la permission `spaces.viewAll` (par défaut ADMIN + MANAGER). Sinon, l'accès
 * est limité aux espaces explicitement accordés via `UserSpaceAccess`.
 */
@Injectable()
export class SpaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** True si l'utilisateur voit TOUS les espaces (pas de restriction). */
  hasFullAccess(user: Pick<CurrentUserData, 'isSuperAdmin' | 'role'>): boolean {
    if (user?.isSuperAdmin) return true;
    if (user?.role?.systemKey === UserRole.ADMIN) return true;
    return (user?.role?.permissions ?? []).includes(SPACES_VIEW_ALL);
  }

  /**
   * Retourne `'ALL'` (aucun filtre) ou la liste des spaceId accessibles.
   * À utiliser pour filtrer les listes d'espaces.
   */
  async getAccessibleSpaceIds(
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'role'>,
  ): Promise<'ALL' | string[]> {
    if (this.hasFullAccess(user)) return 'ALL';
    const rows = await this.prisma.userSpaceAccess.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    });
    return rows.map((r) => r.spaceId);
  }

  /** True si l'utilisateur peut accéder à CET espace précis. */
  async canAccessSpace(
    user: Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'role'>,
    spaceId: string,
  ): Promise<boolean> {
    if (this.hasFullAccess(user)) return true;
    const row = await this.prisma.userSpaceAccess.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId } },
      select: { spaceId: true },
    });
    return !!row;
  }
}
