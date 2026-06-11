/// <reference types="node" />
import { PrismaClient, UserRole } from '@prisma/client';
import { ensureSystemPermissionCatalog, cloneSystemRolesForTenant } from '../src/core/rbac/permission-catalog';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding for multi-tenant SaaS...');

  // ===== RBAC: catalogue de permissions système =====
  await ensureSystemPermissionCatalog(prisma);
  console.log('✅ System permission catalog seeded');

  // ===== TENANT 1: Demo Company =====
  const tenant1 = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      slug: 'demo-company',
      name: 'Demo Company',
      domain: 'demo.datafriday.com',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      metadata: {
        industry: 'Sports & Entertainment',
        size: 'medium',
      },
    },
  });
  console.log('✅ Tenant 1 created:', tenant1.name);

  // RBAC: clone des rôles système (ADMIN/MANAGER/STAFF/VIEWER) pour tenant 1
  const roles1 = await cloneSystemRolesForTenant(prisma, tenant1.id);
  console.log('✅ System roles cloned for tenant 1');

  // Admin user pour tenant 1
  const admin1 = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: 'admin@demo-company.com',
        tenantId: tenant1.id,
      }
    },
    update: { roleId: roles1[UserRole.ADMIN] },
    create: {
      email: 'admin@demo-company.com',
      firstName: 'Admin',
      lastName: 'Demo',
      role: 'ADMIN',
      roleId: roles1[UserRole.ADMIN],
      tenantId: tenant1.id,
    },
  });
  console.log('✅ Admin user created for tenant 1');

  // Space pour tenant 1
  const space1 = await prisma.space.upsert({
    where: { id: 'space-demo-arena' },
    update: {},
    create: {
      id: 'space-demo-arena',
      name: 'Demo Arena',
      tenantId: tenant1.id,
      image: null,
    },
  });
  console.log('✅ Space created for tenant 1');

  // Supplier pour tenant 1
  const supplier1 = await prisma.supplier.upsert({
    where: { id: 'supplier-demo-001' },
    update: {},
    create: {
      id: 'supplier-demo-001',
      name: 'Demo Supplier Paris',
      email: 'contact@demosupplier.com',
      tel: '0140506070',
      city: 'Paris',
      tenantId: tenant1.id,
    },
  });
  console.log('✅ Supplier created for tenant 1');

  // ===== TENANT 2: Test Corp =====
  const tenant2 = await prisma.tenant.upsert({
    where: { slug: 'test-corp' },
    update: {},
    create: {
      slug: 'test-corp',
      name: 'Test Corp',
      domain: 'test.datafriday.com',
      plan: 'STARTER',
      status: 'TRIAL',
      metadata: {
        industry: 'Events',
        size: 'small',
      },
    },
  });
  console.log('✅ Tenant 2 created:', tenant2.name);

  // RBAC: clone des rôles système (ADMIN/MANAGER/STAFF/VIEWER) pour tenant 2
  const roles2 = await cloneSystemRolesForTenant(prisma, tenant2.id);
  console.log('✅ System roles cloned for tenant 2');

  // Admin user pour tenant 2
  const admin2 = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: 'admin@test-corp.com',
        tenantId: tenant2.id,
      }
    },
    update: { roleId: roles2[UserRole.ADMIN] },
    create: {
      email: 'admin@test-corp.com',
      firstName: 'Admin',
      lastName: 'Test',
      role: 'ADMIN',
      roleId: roles2[UserRole.ADMIN],
      tenantId: tenant2.id,
    },
  });
  console.log('✅ Admin user created for tenant 2');

  // Space pour tenant 2
  const space2 = await prisma.space.upsert({
    where: { id: 'space-test-stadium' },
    update: {},
    create: {
      id: 'space-test-stadium',
      name: 'Test Stadium',
      tenantId: tenant2.id,
      image: null,
    },
  });
  console.log('✅ Space created for tenant 2');

  // ===== GLOBAL PRODUCT TYPES & CATEGORIES (tenantId: null = visible by all tenants) =====
  console.log('');
  console.log('🌐 Seeding global product types and categories...');

  const typeBoissons = await prisma.productType.upsert({
    where: { id: 'global-type-boissons' },
    update: {},
    create: { id: 'global-type-boissons', name: 'Boissons', tenantId: null },
  });
  const typeNourriture = await prisma.productType.upsert({
    where: { id: 'global-type-nourriture' },
    update: {},
    create: { id: 'global-type-nourriture', name: 'Nourriture', tenantId: null },
  });
  const typeAlcools = await prisma.productType.upsert({
    where: { id: 'global-type-alcools' },
    update: {},
    create: { id: 'global-type-alcools', name: 'Alcools', tenantId: null },
  });
  console.log('✅ Global product types created (Boissons, Nourriture, Alcools)');

  const globalCategories = [
    // Boissons
    { id: 'global-cat-softs',      name: 'Softs',              typeId: typeBoissons.id },
    { id: 'global-cat-jus',        name: 'Jus & Nectars',      typeId: typeBoissons.id },
    { id: 'global-cat-cafes',      name: 'Cafés & Thés',       typeId: typeBoissons.id },
    { id: 'global-cat-eaux',       name: 'Eaux',               typeId: typeBoissons.id },
    // Nourriture
    { id: 'global-cat-sandwichs',  name: 'Sandwichs & Wraps',  typeId: typeNourriture.id },
    { id: 'global-cat-snacks',     name: 'Snacks & Chips',     typeId: typeNourriture.id },
    { id: 'global-cat-plats',      name: 'Plats Chauds',       typeId: typeNourriture.id },
    { id: 'global-cat-sucreries',  name: 'Sucreries',          typeId: typeNourriture.id },
    // Alcools
    { id: 'global-cat-bieres',     name: 'Bières & Cidres',    typeId: typeAlcools.id },
    { id: 'global-cat-vins',       name: 'Vins & Champagnes',  typeId: typeAlcools.id },
    { id: 'global-cat-spiritueux', name: 'Spiritueux',         typeId: typeAlcools.id },
    { id: 'global-cat-cocktails',  name: 'Cocktails & Shooters', typeId: typeAlcools.id },
  ];

  for (const cat of globalCategories) {
    await prisma.productCategory.upsert({
      where: { id: cat.id },
      update: {},
      create: { ...cat, tenantId: null },
    });
  }
  console.log(`✅ ${globalCategories.length} global product categories created`);

  console.log('');
  console.log('🎉 Multi-tenant database seeded successfully!');
  console.log('📊 Summary:');
  console.log(`  - 2 tenants created`);
  console.log(`  - 2 admin users (1 per tenant)`);
  console.log(`  - 2 spaces (1 per tenant)`);
  console.log(`  - 1 supplier (tenant 1)`);
  console.log(`  - 3 global product types + ${globalCategories.length} global categories`);
  console.log(`  - RBAC: system permission catalog + 4 roles (ADMIN/MANAGER/STAFF/VIEWER) per tenant`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
