#!/bin/bash

# ================================================
# HEOS Architecture - Test Runner
# ================================================
# Ce script lance tous les tests de l'architecture HEOS
# ================================================

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🧪 HEOS Architecture Test Suite${NC}"
echo "=================================="
echo ""

# Vérifier si npm est disponible
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}⚠️  npm n'est pas disponible dans le PATH${NC}"
    echo "Essayez d'exécuter les tests via Docker:"
    echo ""
    echo "  docker-compose exec api npm test -- --testPathPattern='(redis|queue|orchestrator)'"
    echo ""
    exit 1
fi

echo -e "${GREEN}1. Tests Redis Service${NC}"
npm test -- --testPathPattern='redis.service.spec' --passWithNoTests

echo ""
echo -e "${GREEN}2. Tests Queue Service${NC}"
npm test -- --testPathPattern='queue.service.spec' --passWithNoTests

echo ""
echo -e "${GREEN}3. Tests Data Sync Processor${NC}"
npm test -- --testPathPattern='data-sync.processor.spec' --passWithNoTests

echo ""
echo -e "${GREEN}4. Tests Analytics Processor${NC}"
npm test -- --testPathPattern='analytics.processor.spec' --passWithNoTests

echo ""
echo -e "${GREEN}5. Tests Orchestrator Service${NC}"
npm test -- --testPathPattern='orchestrator.service.spec' --passWithNoTests

echo ""
echo -e "${GREEN}6. Tests Orchestrator Controller${NC}"
npm test -- --testPathPattern='orchestrator.controller.spec' --passWithNoTests

echo ""
echo -e "${BLUE}=================================="
echo -e "✅ Tous les tests HEOS terminés${NC}"
