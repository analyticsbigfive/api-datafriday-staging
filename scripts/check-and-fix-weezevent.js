#!/usr/bin/env node
/**
 * Script pour vérifier et corriger la configuration Weezevent
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TENANT_ID = 'cmj8nq42a000113pfk28ns4fa';

// Credentials Weezevent
const WEEZEVENT_CLIENT_ID = 'app_eat-is-family-datafriday_faiafatmtd5kkdbv';
const WEEZEVENT_CLIENT_SECRET = 'vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF';
const WEEZEVENT_ORG_ID = '182509';

function encrypt(text) {
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encryptedText) {
  try {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      return { success: false, error: 'Invalid format' };
    }
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return { success: true, value: decrypted };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🔍 Vérification de la configuration Weezevent...\n');

  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    console.error('❌ ENCRYPTION_KEY invalide dans .env');
    process.exit(1);
  }

  // 1. Récupérer la configuration actuelle
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: {
      id: true,
      name: true,
      weezeventEnabled: true,
      weezeventOrganizationId: true,
      weezeventClientId: true,
      weezeventClientSecret: true,
    }
  });

  if (!tenant) {
    console.error('❌ Tenant non trouvé:', TENANT_ID);
    process.exit(1);
  }

  console.log('📋 Configuration actuelle:');
  console.log('   Tenant:', tenant.name);
  console.log('   weezeventEnabled:', tenant.weezeventEnabled);
  console.log('   weezeventOrganizationId:', tenant.weezeventOrganizationId);
  console.log('   weezeventClientId:', tenant.weezeventClientId);
  console.log('   weezeventClientSecret:', tenant.weezeventClientSecret ? `${tenant.weezeventClientSecret.substring(0, 30)}...` : 'null');

  // 2. Vérifier le format du secret
  let needsUpdate = false;
  
  if (!tenant.weezeventClientSecret) {
    console.log('\n❌ Secret non configuré - mise à jour nécessaire');
    needsUpdate = true;
  } else {
    const parts = tenant.weezeventClientSecret.split(':');
    if (parts.length !== 3) {
      console.log('\n❌ Secret mal formaté (pas chiffré) - mise à jour nécessaire');
      needsUpdate = true;
    } else {
      // Essayer de déchiffrer
      const result = decrypt(tenant.weezeventClientSecret);
      if (result.success) {
        console.log('\n✅ Secret correctement chiffré');
        console.log('   Valeur déchiffrée:', result.value);
      } else {
        console.log('\n❌ Échec du déchiffrement:', result.error);
        needsUpdate = true;
      }
    }
  }

  // 3. Mettre à jour si nécessaire
  if (needsUpdate || !tenant.weezeventEnabled || !tenant.weezeventOrganizationId || !tenant.weezeventClientId) {
    console.log('\n🔧 Mise à jour de la configuration...');
    
    const encryptedSecret = encrypt(WEEZEVENT_CLIENT_SECRET);
    console.log('   Secret chiffré:', encryptedSecret.substring(0, 50) + '...');
    
    await prisma.tenant.update({
      where: { id: TENANT_ID },
      data: {
        weezeventEnabled: true,
        weezeventOrganizationId: WEEZEVENT_ORG_ID,
        weezeventClientId: WEEZEVENT_CLIENT_ID,
        weezeventClientSecret: encryptedSecret,
      }
    });
    
    console.log('\n✅ Configuration mise à jour avec succès!');
    
    // Vérification
    const updated = await prisma.tenant.findUnique({
      where: { id: TENANT_ID },
      select: { weezeventClientSecret: true }
    });
    
    const verifyResult = decrypt(updated.weezeventClientSecret);
    if (verifyResult.success) {
      console.log('✅ Vérification: déchiffrement OK');
    } else {
      console.log('❌ Vérification: échec du déchiffrement');
    }
  } else {
    console.log('\n✅ Aucune mise à jour nécessaire');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Erreur:', error);
  await prisma.$disconnect();
  process.exit(1);
});
