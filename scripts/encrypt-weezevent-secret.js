#!/usr/bin/env node
/**
 * Script pour chiffrer un secret Weezevent
 * Usage: node scripts/encrypt-weezevent-secret.js <secret>
 * 
 * Le résultat peut être utilisé dans enable-weezevent-for-user-tenant.sql
 */

const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.error('❌ ENCRYPTION_KEY manquante ou invalide dans .env');
  console.error('   Doit être 64 caractères hex (32 bytes)');
  console.error('   Générer avec: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const secret = process.argv[2];

if (!secret) {
  console.error('❌ Usage: node scripts/encrypt-weezevent-secret.js <secret>');
  console.error('   Exemple: node scripts/encrypt-weezevent-secret.js vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF');
  process.exit(1);
}

const key = Buffer.from(ENCRYPTION_KEY, 'hex');
const algorithm = 'aes-256-gcm';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

const encryptedSecret = encrypt(secret);

console.log('\n✅ Secret chiffré avec succès!\n');
console.log('📋 Valeur à utiliser dans le SQL:');
console.log(`   '${encryptedSecret}'\n`);
console.log('📝 Exemple SQL:');
console.log(`   UPDATE "Tenant" SET "weezeventClientSecret" = '${encryptedSecret}' WHERE "id" = 'your-tenant-id';`);
console.log('');
