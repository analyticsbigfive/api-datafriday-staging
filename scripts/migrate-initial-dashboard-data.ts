#!/usr/bin/env ts-node

/**
 * Initial data migration script for Space Dashboard Unified API
 * 
 * This script:
 * 1. Creates initial location-to-space mappings based on existing transaction data
 * 2. Runs initial aggregation for all tenants
 * 
 * Usage:
 *   npx ts-node scripts/migrate-initial-dashboard-data.ts [--tenant-id=xxx] [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationOptions {
  tenantId?: string;
  dryRun: boolean;
}

async function parseArgs(): Promise<MigrationOptions> {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--tenant-id=')) {
      options.tenantId = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function createLocationSpaceMappings(
  tenantId: string,
  dryRun: boolean,
): Promise<number> {
  console.log(`\n📍 Creating location-to-space mappings for tenant ${tenantId}...`);

  // Get all spaces for this tenant
  const spaces = await prisma.space.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });

  if (spaces.length === 0) {
    console.log('  ⚠️  No spaces found for this tenant');
    return 0;
  }

  // Get all unique locations from transactions
  const locations = await prisma.$queryRaw<
    Array<{ locationId: string; locationName: string; transactionCount: bigint }>
  >`
    SELECT 
      "locationId",
      "locationName",
      COUNT(*) as "transactionCount"
    FROM "WeezeventTransaction"
    WHERE "tenantId" = ${tenantId}
      AND "locationId" IS NOT NULL
    GROUP BY "locationId", "locationName"
    ORDER BY COUNT(*) DESC
  `;

  console.log(`  Found ${locations.length} unique locations in transactions`);

  let mappingsCreated = 0;

  for (const location of locations) {
    // Check if mapping already exists
    const existing = await prisma.weezeventLocationSpaceMapping.findUnique({
      where: {
        tenantId_weezeventLocationId: {
          tenantId,
          weezeventLocationId: location.locationId,
        },
      },
    });

    if (existing) {
      console.log(`  ⏭️  Mapping already exists for location ${location.locationName}`);
      continue;
    }

    // For single-space tenants, auto-map to that space
    if (spaces.length === 1) {
      if (!dryRun) {
        await prisma.weezeventLocationSpaceMapping.create({
          data: {
            tenantId,
            weezeventLocationId: location.locationId,
            spaceId: spaces[0].id,
          },
        });
      }
      console.log(
        `  ✅ ${dryRun ? '[DRY RUN] Would map' : 'Mapped'} location "${location.locationName}" → space "${spaces[0].name}" (${location.transactionCount} transactions)`,
      );
      mappingsCreated++;
    } else {
      // For multi-space tenants, suggest manual mapping
      console.log(
        `  ⚠️  Manual mapping required for location "${location.locationName}" (${location.transactionCount} transactions)`,
      );
      console.log(`     Available spaces: ${spaces.map((s) => s.name).join(', ')}`);
    }
  }

  return mappingsCreated;
}

async function runInitialAggregation(
  tenantId: string,
  dryRun: boolean,
): Promise<void> {
  console.log(`\n📊 Running initial aggregation for tenant ${tenantId}...`);

  if (dryRun) {
    console.log('  [DRY RUN] Skipping aggregation');
    return;
  }

  // Get date range from transactions
  const dateRange = await prisma.$queryRaw<
    Array<{ minDate: Date; maxDate: Date }>
  >`
    SELECT 
      MIN("transactionDate") as "minDate",
      MAX("transactionDate") as "maxDate"
    FROM "WeezeventTransaction"
    WHERE "tenantId" = ${tenantId}
  `;

  if (!dateRange[0]?.minDate || !dateRange[0]?.maxDate) {
    console.log('  ⚠️  No transactions found for this tenant');
    return;
  }

  const fromDate = dateRange[0].minDate;
  const toDate = dateRange[0].maxDate;

  console.log(`  Date range: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);

  // Note: The actual aggregation would be run via the SpaceAggregationService
  // This is just a placeholder to show what would happen
  console.log('  ℹ️  To run the actual aggregation, use the API endpoint:');
  console.log(`     POST /api/v1/spaces/{spaceId}/dashboard/rebuild?from=${fromDate.toISOString().split('T')[0]}&to=${toDate.toISOString().split('T')[0]}`);
}

async function migrateTenant(tenantId: string, dryRun: boolean): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏢 Processing tenant: ${tenantId}`);
  console.log(`${'='.repeat(60)}`);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, weezeventEnabled: true },
  });

  if (!tenant) {
    console.log(`❌ Tenant ${tenantId} not found`);
    return;
  }

  console.log(`   Name: ${tenant.name}`);
  console.log(`   Weezevent enabled: ${tenant.weezeventEnabled}`);

  if (!tenant.weezeventEnabled) {
    console.log('⚠️  Weezevent not enabled for this tenant, skipping...');
    return;
  }

  const mappingsCreated = await createLocationSpaceMappings(tenantId, dryRun);
  
  if (mappingsCreated > 0) {
    await runInitialAggregation(tenantId, dryRun);
  } else {
    console.log('\n⚠️  No new mappings created, skipping aggregation');
  }
}

async function main() {
  const options = await parseArgs();

  console.log('\n🚀 Space Dashboard Initial Data Migration');
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);

  if (options.tenantId) {
    await migrateTenant(options.tenantId, options.dryRun);
  } else {
    // Migrate all tenants with Weezevent enabled
    const tenants = await prisma.tenant.findMany({
      where: { weezeventEnabled: true },
      select: { id: true },
    });

    console.log(`\nFound ${tenants.length} tenants with Weezevent enabled`);

    for (const tenant of tenants) {
      await migrateTenant(tenant.id, options.dryRun);
    }
  }

  console.log('\n✅ Migration completed!');
  console.log('\nNext steps:');
  console.log('1. Review the mappings created above');
  console.log('2. For multi-space tenants, create manual mappings via the admin UI');
  console.log('3. Run the aggregation jobs via the API endpoints');
  console.log('4. Verify the dashboard displays correctly\n');
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
