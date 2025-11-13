import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT avec validation du tenant
 * Extend le AuthGuard de Passport et ajoute la vérification du tenantId
 */
@Injectable()
export class JwtTenantGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Appelle d'abord la validation JWT standard
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    // Erreur JWT standard
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or missing JWT token');
    }

    // Vérifier que le tenantId/org_id existe dans les claims
    const tenantId = user.org_id || user.tenantId || user.organizationId;
    
    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID missing in JWT claims');
    }

    // Vérifier que le tenant est actif (optionnel - à connecter à la DB)
    // const tenant = await this.tenantService.findOne(tenantId);
    // if (!tenant || tenant.status !== 'ACTIVE') {
    //   throw new UnauthorizedException('Tenant suspended or inactive');
    // }

    return user;
  }
}
