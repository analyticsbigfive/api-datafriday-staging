import { ConfigService } from '@nestjs/config';
import { buildJwtVerifyOptions } from './jwt-secret.provider';

// jwks-rsa pulls in `jose` (ESM) which Jest doesn't transform. The provider
// lazy-requires it only on the JWKS path, so we stub the module here.
jest.mock('jwks-rsa', () => ({
  passportJwtSecret: jest.fn(
    () => (_req: unknown, _token: string, done: (e: unknown, k?: string) => void) =>
      done(null, 'stub-key'),
  ),
}));

const makeConfig = (values: Record<string, string | undefined>): ConfigService =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`missing ${key}`);
      return values[key];
    },
  } as any);

describe('buildJwtVerifyOptions', () => {
  it('defaults to symmetric HS256 with the shared secret', () => {
    const opts = buildJwtVerifyOptions(makeConfig({ JWT_SECRET: 'shh' }));
    expect(opts.algorithms).toEqual(['HS256']);
    expect(opts.secretOrKey).toBe('shh');
    expect(opts.secretOrKeyProvider).toBeUndefined();
  });

  it('uses JWKS (asymmetric) when SUPABASE_JWKS_URI is set', () => {
    const opts = buildJwtVerifyOptions(
      makeConfig({ SUPABASE_JWKS_URI: 'https://x.supabase.co/auth/v1/.well-known/jwks.json' }),
    );
    expect(opts.algorithms).toEqual(['RS256', 'ES256']);
    expect(typeof opts.secretOrKeyProvider).toBe('function');
    expect(opts.secretOrKey).toBeUndefined();
  });

  it('derives the JWKS URI from SUPABASE_URL when JWT_USE_JWKS=true', () => {
    const opts = buildJwtVerifyOptions(
      makeConfig({ JWT_USE_JWKS: 'true', SUPABASE_URL: 'https://x.supabase.co' }),
    );
    expect(opts.algorithms).toEqual(['RS256', 'ES256']);
    expect(typeof opts.secretOrKeyProvider).toBe('function');
  });
});
