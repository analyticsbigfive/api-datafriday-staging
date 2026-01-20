#!/bin/bash

# ================================================
# HEOS Architecture - Installation Script
# ================================================
# Ce script installe les dépendances nécessaires
# pour l'architecture HEOS (Redis, BullMQ, etc.)
# ================================================

set -e

echo "🏗️  Installation des dépendances HEOS Architecture..."
echo ""

# Vérifier si npm est disponible
if ! command -v npm &> /dev/null; then
    echo "❌ npm n'est pas installé. Veuillez installer Node.js d'abord."
    exit 1
fi

# Installer les dépendances Redis et BullMQ
echo "📦 Installation de ioredis (Redis client)..."
npm install ioredis

echo "📦 Installation de @nestjs/bullmq et bullmq..."
npm install @nestjs/bullmq bullmq

echo ""
echo "✅ Dépendances HEOS installées avec succès!"
echo ""
echo "🚀 Pour démarrer l'architecture HEOS:"
echo "   make heos-dev     # Mode développement"
echo "   make heos-up      # Mode production"
echo ""
echo "📊 Pour accéder au monitoring des queues:"
echo "   make bull-board   # Démarre Bull Board sur http://localhost:3001"
echo ""
echo "🔴 Pour accéder à Redis CLI:"
echo "   make redis-cli"
echo ""
