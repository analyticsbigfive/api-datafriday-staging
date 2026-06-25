import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CurrentUserData } from './decorators/current-user.decorator';

/** Profil minimal nécessaire pour résoudre le périmètre d'espaces. */
type SpaceUser = Pick<CurrentUserData, 'id' | 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>;

/**
 * Résout le périmètre d'espaces d'un utilisateur (cf. docs/CONCEPTION_CIBLE_AUTH.md §5).
 *
 * Règle (décision 2026-06-25, raffinée) : l'accès aux espaces est **découplé du rôle**.
 * Accès complet = super-admin, OU owner de l'organisation, OU flag `allSpacesAccess`
 * (positionné par l'owner, présents+futurs). Sinon, l'accès est limité aux espaces
 * explicitement accordés via `UserSpaceAccess` — y compris pour un ADMIN/MANAGER non-owner.
 */
@Injectable()
export class SpaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** True si l'utilisateur voit TOUS les espaces (pas de restriction). */
  hasFullAccess(user: Pick<CurrentUserData, 'isSuperAdmin' | 'isOwner' | 'allSpacesAccess'>): boolean {
    return !!(user?.isSuperAdmin || user?.isOwner || user?.allSpacesAccess);
  }

  /**
   * Retourne `'ALL'` (aucun filtre) ou la liste des spaceId accessibles.
   * À utiliser pour filtrer les listes d'espaces.
   */
  async getAccessibleSpaceIds(user: SpaceUser): Promise<'ALL' | string[]> {
    if (this.hasFullAccess(user)) return 'ALL';
    const rows = await this.prisma.userSpaceAccess.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    });
    return rows.map((r) => r.spaceId);
  }

  /** True si l'utilisateur peut accéder à CET espace précis. */
  async canAccessSpace(
    user: SpaceUser,
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
