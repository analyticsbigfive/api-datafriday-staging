import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * JWT Guard avec lookup DB
 * Utilise la stratégie 'jwt-db' qui récupère le tenant depuis la DB
 */
@Injectable()
export class JwtDatabaseGuard extends AuthGuard('jwt-db') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }
}
