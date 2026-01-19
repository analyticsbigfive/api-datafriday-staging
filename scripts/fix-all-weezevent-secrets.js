#!/usr/bin/env node
/**
 * Script pour vérifier et corriger la configuration Weezevent de TOUS les tenants
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Credentials Weezevent par défaut
const DEFAULT_CLIENT_ID = 'app_eat-is-family-datafriday_faiafatmtd5kkdbv';
const DEFAULT_CLIENT_SECRET = 'vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF';
const DEFAULT_ORG_ID = '182509';

function encrypt(text) {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function isValidEncryptedFormat(secret) {
  if (!secret) return false;
  const parts = secret.split(':');
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

async function main() {
  console.log('🔍 Vérification de la configuration Weezevent de TOUS les tenants...\n');

  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error('❌ ENCRYPTION_KEY invalide dans .env');
    process.exit(1);
  }

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      weezeventEnabled: true,
      weezeventOrganizationId: true,
      weezeventClientId: true,
      weezeventClientSecret: true,
    }
  });

  console.log(`📊 ${tenants.length} tenant(s) trouvé(s)\n`);

  for (const tenant of tenants) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 ${tenant.name} (${tenant.slug})`);
    console.log(`   ID: ${tenant.id}`);
    console.log(`   weezeventEnabled: ${tenant.weezeventEnabled}`);

    // Vérifier si le secret est bien formaté
    const secretOk = isValidEncryptedFormat(tenant.weezeventClientSecret);
    
    if (tenant.weezeventEnabled) {
      if (!secretOk) {
        console.log(`   ❌ Secret mal formaté ou manquant - CORRECTION EN COURS...`);
        
        const encryptedSecret = encrypt(DEFAULT_CLIENT_SECRET);
        
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            weezeventOrganizationId: tenant.weezeventOrganizationId || DEFAULT_ORG_ID,
            weezeventClientId: tenant.weezeventClientId || DEFAULT_CLIENT_ID,
            weezeventClientSecret: encryptedSecret,
          }
        });
        
        console.log(`   ✅ Secret corrigé!`);
      } else {
        console.log(`   ✅ Configuration OK`);
      }
    } else {
      console.log(`   ⚪ Weezevent non activé (pas de correction nécessaire)`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n✅ Vérification terminée!`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Erreur:', error);
  await prisma.$disconnect();
  process.exit(1);
});
