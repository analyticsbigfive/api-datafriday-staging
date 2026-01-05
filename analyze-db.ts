import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function analyzeTables() {
  try {
    console.log('�� Analyzing Supabase Database...\n');
    
    // Get all tables
    const tables = await prisma.$queryRaw<any[]>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    console.log(`📊 Total Tables: ${tables.length}\n`);
    
    for (const table of tables) {
      const tableName = table.table_name;
      
      // Get column information
      const columns = await prisma.$queryRaw<any[]>`
        SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        ORDER BY ordinal_position;
      `;
      
      // Get row count
      const countResult = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*) as count FROM "${tableName}"`
      );
      const count = countResult[0]?.count || 0;
      
      console.log(`\n📋 Table: ${tableName}`);
      console.log(`   Rows: ${count}`);
      console.log(`   Columns: ${columns.length}`);
      console.log('   Structure:');
      
      columns.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${def}`);
      });
    }
    
    console.log('\n✅ Analysis complete!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeTables();
