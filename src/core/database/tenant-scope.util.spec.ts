import {
  applyTenantScope,
  buildTenantScopedModelSet,
  mergeTenantWhere,
} from './tenant-scope.util';

const TENANT = 'tenant-abc';

const scope = (action: string, args: any) => {
  const params: any = { model: 'Space', action, args };
  applyTenantScope(params, TENANT);
  return params.args;
};

describe('tenant-scope.util', () => {
  describe('buildTenantScopedModelSet', () => {
    it('includes models with a required scalar tenantId', () => {
      const set = buildTenantScopedModelSet([
        {
          name: 'Space',
          fields: [{ name: 'tenantId', isRequired: true, kind: 'scalar' }],
        },
      ]);
      expect(set.has('Space')).toBe(true);
    });

    it('excludes models whose tenantId is nullable (e.g. Permission)', () => {
      const set = buildTenantScopedModelSet([
        {
          name: 'Permission',
          fields: [{ name: 'tenantId', isRequired: false, kind: 'scalar' }],
        },
      ]);
      expect(set.has('Permission')).toBe(false);
    });

    it('excludes models without a tenantId field (e.g. Tenant)', () => {
      const set = buildTenantScopedModelSet([
        { name: 'Tenant', fields: [{ name: 'id', isRequired: true, kind: 'scalar' }] },
      ]);
      expect(set.has('Tenant')).toBe(false);
    });
  });

  describe('mergeTenantWhere', () => {
    it('adds tenantId when absent', () => {
      expect(mergeTenantWhere({ id: '1' }, TENANT)).toEqual({ id: '1', tenantId: TENANT });
    });

    it('handles undefined where', () => {
      expect(mergeTenantWhere(undefined, TENANT)).toEqual({ tenantId: TENANT });
    });

    it('never overrides an explicit tenantId', () => {
      expect(mergeTenantWhere({ tenantId: 'other' }, TENANT)).toEqual({ tenantId: 'other' });
    });
  });

  describe('applyTenantScope', () => {
    it.each([
      'findUnique',
      'findFirst',
      'findMany',
      'count',
      'update',
      'delete',
      'updateMany',
      'deleteMany',
    ])('injects tenantId into where for %s', (action) => {
      expect(scope(action, { where: { id: '1' } }).where).toEqual({
        id: '1',
        tenantId: TENANT,
      });
    });

    it('injects tenantId into data for create', () => {
      expect(scope('create', { data: { name: 'x' } }).data).toEqual({
        name: 'x',
        tenantId: TENANT,
      });
    });

    it('injects tenantId into each row for createMany', () => {
      expect(scope('createMany', { data: [{ name: 'a' }, { name: 'b' }] }).data).toEqual([
        { name: 'a', tenantId: TENANT },
        { name: 'b', tenantId: TENANT },
      ]);
    });

    it('scopes both where and create for upsert', () => {
      const args = scope('upsert', {
        where: { id: '1' },
        create: { name: 'x' },
        update: {},
      });
      expect(args.where).toEqual({ id: '1', tenantId: TENANT });
      expect(args.create).toEqual({ name: 'x', tenantId: TENANT });
    });

    it('does not override an explicit tenantId on create', () => {
      expect(scope('create', { data: { name: 'x', tenantId: 'explicit' } }).data.tenantId).toBe(
        'explicit',
      );
    });
  });
});
