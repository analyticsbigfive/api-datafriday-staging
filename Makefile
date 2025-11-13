.PHONY: help build up down restart logs clean install dev prod prisma-generate prisma-migrate prisma-studio prisma-seed test

# Couleurs pour l'affichage
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Affiche cette aide
	@echo "$(BLUE)API DataFriday - Commandes disponibles:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# === DOCKER ===

build: ## Construit les images Docker
	@echo "$(BLUE)🔨 Construction des images Docker...$(NC)"
	docker-compose build

up: ## Démarre les conteneurs (production)
	@echo "$(BLUE)🚀 Démarrage des conteneurs...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✅ API démarrée sur http://localhost:3000/api/v1$(NC)"

dev: ## Démarre les conteneurs en mode développement
	@echo "$(BLUE)🔧 Démarrage en mode développement...$(NC)"
	docker-compose --profile dev up -d
	@echo "$(GREEN)✅ API dev démarrée sur http://localhost:3000/api/v1$(NC)"

down: ## Arrête et supprime les conteneurs
	@echo "$(YELLOW)🛑 Arrêt des conteneurs...$(NC)"
	docker-compose down

restart: ## Redémarre les conteneurs
	@echo "$(BLUE)🔄 Redémarrage des conteneurs...$(NC)"
	docker-compose restart

logs: ## Affiche les logs en temps réel
	docker-compose logs -f

logs-api: ## Affiche les logs de l'API uniquement
	docker-compose logs -f api

logs-db: ## Affiche les logs de la base de données
	docker-compose logs -f postgres

clean: ## Nettoie tout (conteneurs, volumes, images)
	@echo "$(RED)🧹 Nettoyage complet...$(NC)"
	docker-compose down -v
	@echo "$(GREEN)✅ Nettoyage terminé$(NC)"

rebuild: clean build up ## Reconstruction complète

# === PRISMA ===

prisma-generate: ## Génère le client Prisma
	@echo "$(BLUE)📦 Génération du client Prisma...$(NC)"
	docker-compose exec api npx prisma generate
	@echo "$(GREEN)✅ Client Prisma généré$(NC)"

prisma-migrate: ## Crée et applique une migration
	@echo "$(BLUE)🗄️  Migration de la base de données...$(NC)"
	@read -p "Nom de la migration: " migration_name; \
	docker-compose exec api npx prisma migrate dev --name $$migration_name
	@echo "$(GREEN)✅ Migration appliquée$(NC)"

prisma-migrate-deploy: ## Applique les migrations en production
	@echo "$(BLUE)🗄️  Application des migrations...$(NC)"
	docker-compose exec api npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

prisma-studio: ## Ouvre Prisma Studio
	@echo "$(BLUE)🎨 Ouverture de Prisma Studio...$(NC)"
	docker-compose exec api npx prisma studio

prisma-seed: ## Exécute le script de seed
	@echo "$(BLUE)🌱 Seed de la base de données...$(NC)"
	docker-compose exec api npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

prisma-reset: ## Réinitialise la base de données
	@echo "$(RED)⚠️  Réinitialisation de la base de données...$(NC)"
	docker-compose exec api npx prisma migrate reset --force
	@echo "$(GREEN)✅ Base réinitialisée$(NC)"

# === INSTALLATION ===

install: ## Installe les dépendances (dans Docker)
	@echo "$(BLUE)📦 Installation des dépendances dans Docker...$(NC)"
	docker-compose build --no-cache
	@echo "$(GREEN)✅ Dépendances installées$(NC)"

setup: ## Setup complet du projet
	@echo "$(BLUE)⚙️  Configuration du projet...$(NC)"
	@if [ ! -f .env ]; then cp .env.example .env; echo "$(GREEN)✅ Fichier .env créé$(NC)"; fi
	@echo "$(GREEN)✅ Setup terminé! Lancez 'make up' pour démarrer$(NC)"

# === DÉVELOPPEMENT ===

shell-api: ## Ouvre un shell dans le conteneur API
	docker-compose exec api sh

shell-db: ## Ouvre psql dans le conteneur Postgres
	docker-compose exec postgres psql -U datafriday -d datafriday

test: ## Lance les tests
	docker-compose exec api npm run test

test-e2e: ## Lance les tests end-to-end
	docker-compose exec api npm run test:e2e

lint: ## Vérifie le code avec ESLint
	docker-compose exec api npm run lint

format: ## Formate le code avec Prettier
	docker-compose exec api npm run format

# === UTILITAIRES ===

status: ## Affiche le statut des conteneurs
	@docker-compose ps

health: ## Vérifie la santé de l'API
	@echo "$(BLUE)🏥 Vérification de la santé de l'API...$(NC)"
	@curl -s http://localhost:3000/api/v1/health | jq . || echo "$(RED)❌ API non disponible$(NC)"

db-backup: ## Crée un backup de la base de données
	@echo "$(BLUE)💾 Création du backup...$(NC)"
	@mkdir -p backups
	@docker-compose exec -T postgres pg_dump -U datafriday datafriday > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)✅ Backup créé dans backups/$(NC)"

db-restore: ## Restaure un backup (usage: make db-restore FILE=backup.sql)
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)❌ Usage: make db-restore FILE=backups/backup_20251113_080000.sql$(NC)"; \
		exit 1; \
	fi
	@echo "$(BLUE)📥 Restauration du backup...$(NC)"
	@cat $(FILE) | docker-compose exec -T postgres psql -U datafriday -d datafriday
	@echo "$(GREEN)✅ Backup restauré$(NC)"

# === PRODUCTION ===

prod: ## Démarre en mode production avec build
	@echo "$(BLUE)🚀 Démarrage en production...$(NC)"
	docker-compose up -d --build
	@echo "$(GREEN)✅ Production démarrée$(NC)"

prod-logs: ## Affiche les logs de production
	docker-compose logs -f --tail=100

# === ENVIRONMENTS - SUPABASE ===

## DEVELOPMENT
dev-up: ## Démarre en DEVELOPMENT (Supabase)
	@echo "$(BLUE)🔧 Démarrage DEVELOPMENT avec Supabase...$(NC)"
	@if [ ! -f .env.development ]; then echo "$(RED)❌ Fichier .env.development manquant$(NC)"; exit 1; fi
	docker-compose --env-file .env.development up -d --build
	@echo "$(GREEN)✅ Development démarré$(NC)"

dev-down: ## Arrête DEVELOPMENT
	docker-compose down

dev-logs: ## Logs DEVELOPMENT
	docker-compose logs -f --tail=100

dev-migrate: ## Migrations DEVELOPMENT
	@echo "$(BLUE)🗄️  Migrations sur Supabase DEV...$(NC)"
	docker-compose --env-file .env.development exec api npx prisma migrate dev
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

dev-seed: ## Seed DEVELOPMENT
	@echo "$(BLUE)🌱 Seed Supabase DEV...$(NC)"
	docker-compose --env-file .env.development exec api npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

dev-studio: ## Prisma Studio DEVELOPMENT
	docker-compose --env-file .env.development exec api npx prisma studio

## STAGING
staging-up: ## Démarre en STAGING (Supabase)
	@echo "$(BLUE)🚧 Démarrage STAGING avec Supabase...$(NC)"
	@if [ ! -f .env.staging ]; then echo "$(RED)❌ Fichier .env.staging manquant$(NC)"; exit 1; fi
	docker-compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
	@echo "$(GREEN)✅ Staging démarré$(NC)"

staging-down: ## Arrête STAGING
	docker-compose -f docker-compose.staging.yml down

staging-logs: ## Logs STAGING
	docker-compose -f docker-compose.staging.yml logs -f --tail=100

staging-migrate: ## Migrations STAGING
	@echo "$(BLUE)🗄️  Migrations sur Supabase STAGING...$(NC)"
	docker-compose -f docker-compose.staging.yml --env-file .env.staging run --rm api npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

staging-seed: ## Seed STAGING
	@echo "$(BLUE)🌱 Seed Supabase STAGING...$(NC)"
	docker-compose -f docker-compose.staging.yml --env-file .env.staging run --rm api npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

## PRODUCTION
prod-up: ## Démarre en PRODUCTION (Supabase)
	@echo "$(BLUE)🚀 Démarrage PRODUCTION avec Supabase...$(NC)"
	@if [ ! -f .env.production ]; then echo "$(RED)❌ Fichier .env.production manquant$(NC)"; exit 1; fi
	docker-compose -f docker-compose.production.yml --env-file .env.production up -d --build
	@echo "$(GREEN)✅ Production démarrée$(NC)"

prod-down: ## Arrête PRODUCTION
	docker-compose -f docker-compose.production.yml down

prod-logs: ## Logs PRODUCTION
	docker-compose -f docker-compose.production.yml logs -f --tail=100

prod-migrate: ## Migrations PRODUCTION
	@echo "$(BLUE)🗄️  Migrations sur Supabase PROD...$(NC)"
	docker-compose -f docker-compose.production.yml --env-file .env.production run --rm api npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

prod-seed: ## Seed PRODUCTION (⚠️  ATTENTION!)
	@echo "$(RED)⚠️  SEED EN PRODUCTION - Êtes-vous sûr? (Ctrl+C pour annuler)$(NC)"
	@sleep 3
	@echo "$(BLUE)🌱 Seed Supabase PROD...$(NC)"
	docker-compose -f docker-compose.production.yml --env-file .env.production run --rm api npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

# === QUICK START ===

quickstart: setup build up prisma-generate prisma-migrate prisma-seed ## Démarrage rapide complet
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)  🎉 API DataFriday prête!$(NC)"
	@echo "$(GREEN)========================================$(NC)"
	@echo ""
	@echo "  📍 API:           http://localhost:3000/api/v1"
	@echo "  🏥 Health check:  http://localhost:3000/api/v1/health"
	@echo "  🎨 Prisma Studio: make prisma-studio"
	@echo ""
	@echo "$(BLUE)Commandes utiles:$(NC)"
	@echo "  make logs        - Voir les logs"
	@echo "  make shell-api   - Accéder au shell API"
	@echo "  make down        - Arrêter les services"
	@echo ""
