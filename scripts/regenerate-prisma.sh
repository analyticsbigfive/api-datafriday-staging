#!/bin/bash

# Script pour régénérer le client Prisma après modification du schema
# Usage: ./scripts/regenerate-prisma.sh

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Régénération du client Prisma...${NC}"
echo ""

# 1. Arrêter le conteneur
echo -e "${YELLOW}📌 Étape 1/4 : Arrêt du conteneur...${NC}"
docker-compose down

# 2. Rebuild l'image (pour inclure les nouveaux fichiers)
echo -e "${YELLOW}📌 Étape 2/4 : Rebuild de l'image...${NC}"
docker-compose build api-dev --no-cache

# 3. Démarrer le conteneur
echo -e "${YELLOW}📌 Étape 3/4 : Démarrage du conteneur...${NC}"
docker-compose --env-file envFiles/.env.development --profile dev up -d api-dev

# Attendre que le conteneur soit prêt
echo -e "${YELLOW}⏳ Attente du démarrage (10s)...${NC}"
sleep 10

# 4. Générer le client Prisma
echo -e "${YELLOW}📌 Étape 4/4 : Génération du client Prisma...${NC}"
docker-compose exec api-dev npx prisma generate

echo ""
echo -e "${GREEN}✅ Client Prisma régénéré avec succès!${NC}"
echo ""
echo -e "${BLUE}📝 Vérification:${NC}"
docker-compose logs api-dev --tail=20 | grep -E "(Database|Application is running)"

echo ""
echo -e "${GREEN}🎉 Terminé! L'API est prête.${NC}"
echo -e "${BLUE}📍 API:           http://localhost:3000/api/v1${NC}"
echo -e "${BLUE}🏥 Health check:  http://localhost:3000/api/v1/health${NC}"
