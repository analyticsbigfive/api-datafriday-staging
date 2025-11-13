import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware pour extraire et valider le tenantId depuis le JWT
 * À placer APRÈS l'AuthGuard qui valide le JWT
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Récupérer le user depuis le JWT (mis par AuthGuard)
    const user = (req as any).user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Extraire orgId/tenantId depuis les claims JWT
    const tenantId = user.org_id || user.tenantId || user.organizationId;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID missing in JWT claims');
    }

    // Injecter dans request pour utilisation ultérieure
    (req as any).tenantId = tenantId;

    next();
  }
}
