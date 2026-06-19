import { Test, TestingModule } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { PrismaService } from './prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TENANT_ID_KEY } from '../tenant/tenant-context.constants';

/**
 * End-to-end validation of the automatic multi-tenant isolation against a REAL
 * database. Two tenants are seeded; every query is run inside a CLS context for
 * one tenant and we assert the other tenant's data is never read or mutated.
 *
 * Requires DATABASE_URL (skipped otherwise), like prisma.service.spec.ts.
 */
const hasDatabase = !!process.env.DATABASE_URL;

(hasDatabase ? describe : describe.skip)('Tenant isolation (integration)', () => {
  let prisma: PrismaService;
  let cls: ClsService;
  let tenantCtx: TenantContextService;
  let tenantA: string;
  let tenantB: string;

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // Run a unit of work inside a CLS context scoped to `tenantId`.
  const inTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    cls.run(async () => {
      cls.set(TENANT_ID_KEY, tenantId);
      return fn();
    });

  // Helper: create a space (tenantId is injected automatically by the middleware).
  const createSpace = (tenantId: string, name: string) =>
    inTenant(tenantId, () => prisma.space.create({ data: { name } as any }));

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [PrismaService, TenantContextService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    cls = moduleRef.get(ClsService);
    tenantCtx = moduleRef.get(TenantContextService);
    await prisma.$connect();

    // Seed two tenants with NO active tenant context (Tenant is not scoped).
    const a = await prisma.tenant.create({
      data: { name: `ISO A ${suffix}`, slug: `iso-a-${suffix}` },
    });
    const b = await prisma.tenant.create({
      data: { name: `ISO B ${suffix}`, slug: `iso-b-${suffix}` },
    });
    tenantA = a.id;
    tenantB = b.id;
  }, 30000);

  afterAll(async () => {
    // Cascade-deletes the seeded spaces; run with no tenant context.
    if (tenantA) await prisma.tenant.delete({ where: { id: tenantA } }).catch(() => undefined);
    if (tenantB) await prisma.tenant.delete({ where: { id: tenantB } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('auto-injects tenantId on create (no tenantId passed)', async () => {
    const space = await createSpace(tenantA, 'A-space');
    expect(space.tenantId).toBe(tenantA);
  });

  it('scopes findMany & count to the active tenant', async () => {
    await createSpace(tenantB, 'B-space');

    const aSpaces = await inTenant(tenantA, () => prisma.space.findMany());
    expect(aSpaces.every((s) => s.tenantId === tenantA)).toBe(true);
    expect(aSpaces.some((s) => s.name === 'B-space')).toBe(false);

    const aCount = await inTenant(tenantA, () => prisma.space.count());
    const bCount = await inTenant(tenantB, () => prisma.space.count());
    expect(aCount).toBeGreaterThanOrEqual(1);
    expect(bCount).toBeGreaterThanOrEqual(1);
  });

  it('blocks cross-tenant findUnique by id', async () => {
    const bSpace = await createSpace(tenantB, 'B-only');

    const leaked = await inTenant(tenantA, () =>
      prisma.space.findUnique({ where: { id: bSpace.id } }),
    );
    expect(leaked).toBeNull();

    const own = await inTenant(tenantB, () =>
      prisma.space.findUnique({ where: { id: bSpace.id } }),
    );
    expect(own?.id).toBe(bSpace.id);
  });

  it('blocks cross-tenant update & delete', async () => {
    const bSpace = await createSpace(tenantB, 'B-protected');

    const updated = await inTenant(tenantA, () =>
      prisma.space.updateMany({ where: { id: bSpace.id }, data: { name: 'hacked' } }),
    );
    expect(updated.count).toBe(0);

    const deleted = await inTenant(tenantA, () =>
      prisma.space.deleteMany({ where: { id: bSpace.id } }),
    );
    expect(deleted.count).toBe(0);

    const intact = await inTenant(tenantB, () =>
      prisma.space.findUnique({ where: { id: bSpace.id } }),
    );
    expect(intact?.name).toBe('B-protected');
  });

  it('runWithoutTenantScope() bypasses scoping for legitimate cross-tenant ops', async () => {
    const all = await inTenant(tenantA, () =>
      tenantCtx.runWithoutTenantScope(() =>
        prisma.space.findMany({ where: { tenantId: { in: [tenantA, tenantB] } } }),
      ),
    );
    const seen = new Set(all.map((s) => s.tenantId));
    expect(seen.has(tenantA)).toBe(true);
    expect(seen.has(tenantB)).toBe(true);
  });

  it('no active context → no scoping (background jobs / seeds)', async () => {
    const all = await prisma.space.findMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
