#!/bin/bash
# organize-docs.sh - Organise la documentation

DOCS_DIR="/Users/bigfiveabidjan/Projets/api-datafriday-staging/docs"

# Architecture
mv "$DOCS_DIR/DATA_SOURCES.md" "$DOCS_DIR/architecture/" 2>/dev/null
mv "$DOCS_DIR/SUPABASE.md" "$DOCS_DIR/architecture/" 2>/dev/null

# API
mv "$DOCS_DIR/API_REFERENCE.md" "$DOCS_DIR/api/" 2>/dev/null
mv "$DOCS_DIR/API_VERSIONING.md" "$DOCS_DIR/api/" 2>/dev/null
mv "$DOCS_DIR/API_MIGRATION_V1.md" "$DOCS_DIR/api/" 2>/dev/null
mv "$DOCS_DIR/FRONTEND_API_GUIDE.md" "$DOCS_DIR/api/" 2>/dev/null
mv "$DOCS_DIR/SPACES_API_GUIDE.md" "$DOCS_DIR/api/" 2>/dev/null

# Auth
mv "$DOCS_DIR/AUTH_QUICKSTART.md" "$DOCS_DIR/auth/" 2>/dev/null
mv "$DOCS_DIR/AUTH_TESTING_GUIDE.md" "$DOCS_DIR/auth/" 2>/dev/null

# Weezevent
mv "$DOCS_DIR/WEEZEVENT_ANALYTICS.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_ANALYTICS_GUIDE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_API_CLIENT_USAGE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_ARCHITECTURE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_CREDENTIALS_USAGE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_DATA_MAPPING.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_FNB_MAPPING.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_INDEX.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_INTEGRATION.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_PERFORMANCE_GUIDE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_SYNC_USER_GUIDE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_TESTING_GUIDE.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_WEBHOOK_QUICKSTART.md" "$DOCS_DIR/weezevent/" 2>/dev/null
mv "$DOCS_DIR/WEEZEVENT_WEBHOOK_SETUP.md" "$DOCS_DIR/weezevent/" 2>/dev/null

# Testing
mv "$DOCS_DIR/SPACES_TESTING_GUIDE.md" "$DOCS_DIR/testing/" 2>/dev/null

# Supprimer l'ancien INDEX et renommer le nouveau
rm "$DOCS_DIR/INDEX.md" 2>/dev/null
mv "$DOCS_DIR/INDEX_RESTRUCTURED.md" "$DOCS_DIR/INDEX.md" 2>/dev/null

# Supprimer fichiers inutiles
rm "$DOCS_DIR/figmq bd.txt" 2>/dev/null
rm "$DOCS_DIR/API Reference _ Weezevent.mhtml" 2>/dev/null

echo "✅ Documentation organisée!"
