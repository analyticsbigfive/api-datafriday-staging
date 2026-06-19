import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt } from 'passport-jwt';

const logger = new Logger('JwtVerifyOptions');

/**
 * Subset of passport-jwt StrategyOptions related to signature verification.
 * Mutually-exclusive: either a static `secretOrKey` (HS256) or a dynamic
 * `secretOrKeyProvider` (JWKS / asymmetric).
 */
export interface JwtVerifyOptions {
  jwtFromRequest: ReturnType<typeof ExtractJwt.fromAuthHeaderAsBearerToken>;
  ignoreExpiration: boolean;
  algorithms: string[];
  secretOrKey?: string;
  secretOrKeyProvider?: (
    request: unknown,
    rawJwtToken: string,
    done: (err: unknown, secret?: string | Buffer) => void,
  ) => void;
}

/**
 * Resolve the JWKS endpoint, if asymmetric verification is enabled.
 *  - explicit `SUPABASE_JWKS_URI` wins;
 *  - otherwise, when `JWT_USE_JWKS=true`, derive it from `SUPABASE_URL`.
 *  - returns null → fall back to the legacy shared HS256 secret.
 */
function resolveJwksUri(config: ConfigService): string | null {
  const explicit = config.get<string>('SUPABASE_JWKS_URI');
  if (explicit) {
    return explicit;
  }

  const useJwks = config.get<string>('JWT_USE_JWKS');
  const supabaseUrl = config.get<string>('SUPABASE_URL');
  if (useJwks === 'true' && supabaseUrl) {
    return `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  }

  return null;
}

/**
 * Build the verification options shared by every JWT strategy.
 *
 * Backward-compatible by default: with no JWKS configured, behaves exactly like
 * the previous HS256 + shared-secret setup. Set `SUPABASE_JWKS_URI` (or
 * `JWT_USE_JWKS=true` + `SUPABASE_URL`) to switch to asymmetric verification,
 * ready for Supabase's rotating signing keys.
 */
export function buildJwtVerifyOptions(config: ConfigService): JwtVerifyOptions {
  const base = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    ignoreExpiration: false,
  };

  const jwksUri = resolveJwksUri(config);

  if (jwksUri) {
    logger.log(`JWT verification: asymmetric (JWKS) via ${jwksUri}`);
    // Lazy-require: jwks-rsa pulls in `jose` (ESM). Loading it only when JWKS is
    // actually enabled keeps the default HS256 path (and the test runner) free of
    // the ESM transform requirement, and avoids the cost when it isn't used.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { passportJwtSecret } = require('jwks-rsa');
    return {
      ...base,
      algorithms: ['RS256', 'ES256'],
      secretOrKeyProvider: passportJwtSecret({
        jwksUri,
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000, // 10 min
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),
    };
  }

  logger.log('JWT verification: symmetric (HS256) via shared JWT_SECRET');
  return {
    ...base,
    algorithms: ['HS256'],
    secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
  };
}
