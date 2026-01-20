#!/bin/bash
# Deploy Supabase Edge Functions
# Usage: ./scripts/deploy-edge-functions.sh

set -e

echo "🚀 Deploying Supabase Edge Functions..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    
    # Detect OS and install
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install supabase/tap/supabase
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux installation
        curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/scripts/install.sh | sh
    else
        echo "Please install Supabase CLI manually: https://supabase.com/docs/guides/cli"
        exit 1
    fi
fi

# Check Supabase login
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase. Please run: supabase login"
    exit 1
fi

# Load environment variables
if [ -f "envFiles/.env.production" ]; then
    source envFiles/.env.production
elif [ -f "envFiles/.env.staging" ]; then
    source envFiles/.env.staging
else
    echo "⚠️ No environment file found. Using SUPABASE_PROJECT_ID from env..."
fi

# Check project ID
if [ -z "$SUPABASE_PROJECT_ID" ]; then
    echo "❌ SUPABASE_PROJECT_ID not set. Please set it in your environment."
    exit 1
fi

echo "📦 Linking to Supabase project: $SUPABASE_PROJECT_ID"
supabase link --project-ref "$SUPABASE_PROJECT_ID"

# Deploy Edge Functions
echo ""
echo "📤 Deploying health function..."
supabase functions deploy health --no-verify-jwt

echo ""
echo "📤 Deploying heavy-processing function..."
supabase functions deploy heavy-processing

echo ""
echo "✅ Edge Functions deployed successfully!"
echo ""
echo "📋 Verify deployment:"
echo "   - Health: ${SUPABASE_URL}/functions/v1/health"
echo "   - Heavy Processing: ${SUPABASE_URL}/functions/v1/heavy-processing"
