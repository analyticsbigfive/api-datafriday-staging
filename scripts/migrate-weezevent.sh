#!/bin/bash
# Migration script for Weezevent credentials
# This script applies the Prisma migration using Docker

set -e

echo "🔧 Weezevent Credentials Migration"
echo "===================================="
echo ""

# Check if ENCRYPTION_KEY is set
if ! grep -q "ENCRYPTION_KEY" envFiles/.env.development 2>/dev/null; then
    echo "⚠️  ENCRYPTION_KEY not found in envFiles/.env.development"
    echo ""
    echo "Generating a new encryption key..."
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo ""
    echo "Add this line to your envFiles/.env.development:"
    echo ""
    echo "ENCRYPTION_KEY=\"$ENCRYPTION_KEY\""
    echo ""
    echo "❌ Please add the ENCRYPTION_KEY and run this script again."
    exit 1
fi

echo "✅ ENCRYPTION_KEY found"
echo ""

# Start Supabase CLI container
echo "🚀 Starting Supabase CLI container..."
make supabase-up

echo ""
echo "📝 Creating migration..."
echo "Migration name: add_weezevent_credentials"
echo ""

# Run the migration
make dev-migrate <<EOF
add_weezevent_credentials
EOF

echo ""
echo "✅ Migration completed!"
echo ""
echo "🔄 Restarting development containers..."
make dev-down
make dev-up

echo ""
echo "✅ All done! Weezevent credentials storage is ready."
echo ""
echo "Test the endpoints:"
echo "  PATCH /onboarding/tenants/{tenantId}/weezevent"
echo "  GET   /onboarding/tenants/{tenantId}/weezevent"
