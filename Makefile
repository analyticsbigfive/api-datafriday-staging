.PHONY: help build up down restart logs clean install dev prod prisma-generate prisma-migrate prisma-studio prisma-seed test organize-docs redis-up bull-board heos-up heos-down

# Charger variables d'environnement depuis envFiles/.env.development
ifneq (,$(wildcard envFiles/.env.development))
    include envFiles/.env.development
    export
endif

API_PORT := $(subst ",,$(API_PORT))
REDIS_PORT := $(subst ",,$(REDIS_PORT))
BULL_BOARD_PORT := $(subst ",,$(BULL_BOARD_PORT))
export API_PORT REDIS_PORT BULL_BOARD_PORT

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

# === HEOS ARCHITECTURE ===

redis-up: ## Démarre Redis seul
	@echo "$(BLUE)🔴 Démarrage Redis...$(NC)"
	docker-compose up -d redis
	@echo "$(GREEN)✅ Redis démarré sur port 6379$(NC)"

bull-board: ## Démarre Bull Board (monitoring des queues)
	@echo "$(BLUE)📊 Démarrage Bull Board...$(NC)"
	docker-compose --profile monitoring up -d bull-board
	@echo "$(GREEN)✅ Bull Board disponible sur http://localhost:3001$(NC)"

heos-up: ## Démarre l'architecture HEOS complète (Redis + API + Bull Board)
	@echo "$(BLUE)🏗️  Démarrage Architecture HEOS...$(NC)"
	docker-compose --profile monitoring up -d redis bull-board api
	@echo "$(GREEN)✅ HEOS Architecture démarrée$(NC)"
	@echo "  - API:        http://localhost:3000/api/v1"
	@echo "  - Bull Board: http://localhost:3001"
	@echo "  - Redis:      localhost:6379"

heos-dev: ## Démarre HEOS en mode développement
	@echo "$(BLUE)🏗️  Démarrage HEOS Development...$(NC)"
	@$(MAKE) env-dev-init
	docker-compose --env-file envFiles/.env.development --profile dev --profile monitoring up -d redis bull-board api-dev
	@echo "$(GREEN)✅ HEOS Dev démarré$(NC)"
	@echo "  - API (dev):  http://localhost:3000/api/v1"
	@echo "  - Bull Board: http://localhost:3001"
	@echo "  - Redis:      localhost:6379"

heos-down: ## Arrête toute l'architecture HEOS
	@echo "$(YELLOW)🛑 Arrêt HEOS...$(NC)"
	docker-compose --profile monitoring down
	@echo "$(GREEN)✅ HEOS arrêté$(NC)"

heos-logs: ## Affiche les logs de tous les services HEOS
	docker-compose --profile monitoring logs -f redis bull-board api

redis-cli: ## Ouvre un shell Redis CLI
	@echo "$(BLUE)🔧 Redis CLI...$(NC)"
	docker-compose exec redis redis-cli

# === TESTS HEOS ===

test-heos: ## Lance les tests unitaires HEOS
	@echo "$(BLUE)🧪 Tests HEOS Architecture...$(NC)"
	docker-compose exec api npm test -- --testPathPattern='(redis|queue|orchestrator)' --passWithNoTests
	@echo "$(GREEN)✅ Tests HEOS terminés$(NC)"

test-heos-watch: ## Lance les tests HEOS en mode watch
	@echo "$(BLUE)🧪 Tests HEOS (watch mode)...$(NC)"
	docker-compose exec api npm test -- --testPathPattern='(redis|queue|orchestrator)' --watch

test-heos-coverage: ## Lance les tests HEOS avec couverture
	@echo "$(BLUE)🧪 Tests HEOS avec couverture...$(NC)"
	docker-compose exec api npm test -- --testPathPattern='(redis|queue|orchestrator)' --coverage
	@echo "$(GREEN)✅ Rapport de couverture généré$(NC)"

# === DOCKER ===

build: ## Construit les images Docker
	@echo "$(BLUE)🔨 Construction des images Docker...$(NC)"
	docker-compose build

env-dev-init: ## Initialise envFiles/.env.development si absent (ne l'écrase jamais)
	@if [ ! -f envFiles/.env.development ]; then \
		mkdir -p envFiles; \
		cp .env.example envFiles/.env.development; \
		echo "$(GREEN)✅ envFiles/.env.development créé depuis .env.example (à compléter)$(NC)"; \
	else \
		echo "$(GREEN)✅ envFiles/.env.development existe déjà (aucun écrasement)$(NC)"; \
	fi

up: ## Démarre les conteneurs (production)
	@echo "$(BLUE)🚀 Démarrage des conteneurs...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✅ API démarrée sur http://localhost:3000/api/v1$(NC)"

dev-up: ## Démarre les conteneurs DEVELOPMENT
	@echo "$(BLUE)🚀 Démarrage DEVELOPMENT...$(NC)"
	@$(MAKE) env-dev-init
	docker-compose --env-file envFiles/.env.development --profile dev up -d api-dev
	@echo "$(GREEN)✅ Development démarré$(NC)"

frontend-up: ## Démarre l'interface de test frontend (Docker)
	@echo "$(BLUE)🎨 Démarrage test-frontend...$(NC)"
	docker-compose --profile frontend up -d test-frontend
	@echo "$(GREEN)✅ Test frontend prêt sur http://localhost:8080$(NC)"

frontend-down: ## Arrête l'interface de test frontend
	@echo "$(YELLOW)🛑 Arrêt test-frontend...$(NC)"
	docker-compose --profile frontend down

dev-full: ## Démarre l'API (dev) + frontend de test
	@echo "$(BLUE)🚀 Démarrage complet (API dev + frontend)...$(NC)"
	$(MAKE) dev-up
	$(MAKE) frontend-up

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

# === SUPABASE CLI ===

supabase-up: ## Démarre le conteneur Supabase CLI (development)
	@echo "$(BLUE)🚀 Démarrage Supabase CLI (development)...$(NC)"
	docker-compose --env-file envFiles/.env.development --profile tools up -d supabase-cli
	@echo "$(GREEN)✅ Supabase CLI prêt$(NC)"

supabase-up-staging: ## Démarre le conteneur Supabase CLI (staging)
	@echo "$(BLUE)🚀 Démarrage Supabase CLI (staging)...$(NC)"
	docker-compose --env-file envFiles/.env.staging --profile tools up -d supabase-cli
	@echo "$(GREEN)✅ Supabase CLI prêt$(NC)"

supabase-up-prod: ## Démarre le conteneur Supabase CLI (production)
	@echo "$(BLUE)🚀 Démarrage Supabase CLI (production)...$(NC)"
	docker-compose --env-file envFiles/.env.production --profile tools up -d supabase-cli
	@echo "$(GREEN)✅ Supabase CLI prêt$(NC)"

supabase-shell: ## Ouvre un shell dans le conteneur Supabase CLI
	@echo "$(BLUE)🔧 Shell Supabase CLI...$(NC)"
	docker-compose exec supabase-cli bash

supabase-migration-new: ## Crée une nouvelle migration Supabase
	@echo "$(BLUE)📝 Création d'une nouvelle migration...$(NC)"
	@read -p "Nom de la migration: " migration_name; \
	docker-compose exec supabase-cli bash -c "cd /app && supabase migration new $$migration_name"
	@echo "$(GREEN)✅ Migration créée dans supabase/migrations/$(NC)"

supabase-db-push: ## Applique les migrations locales à Supabase distant
	@echo "$(BLUE)🚀 Application des migrations à Supabase...$(NC)"
	docker-compose exec supabase-cli bash -c "cd /app && supabase db push"
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

supabase-db-pull: ## Récupère le schéma depuis Supabase distant
	@echo "$(BLUE)📥 Récupération du schéma Supabase...$(NC)"
	docker-compose exec supabase-cli bash -c "cd /app && supabase db pull"
	@echo "$(GREEN)✅ Schéma récupéré$(NC)"

supabase-db-diff: ## Génère une migration depuis les changements
	@echo "$(BLUE)🔍 Détection des changements...$(NC)"
	@read -p "Nom de la migration: " migration_name; \
	docker-compose exec supabase-cli bash -c "cd /app && supabase db diff -f $$migration_name"
	@echo "$(GREEN)✅ Migration de différences créée$(NC)"

supabase-db-reset: ## Réinitialise la DB locale Supabase (si supabase start)
	@echo "$(RED)⚠️  Réinitialisation Supabase local...$(NC)"
	docker-compose exec supabase-cli bash -c "cd /app && supabase db reset"
	@echo "$(GREEN)✅ DB locale réinitialisée$(NC)"

supabase-link: ## Lie le projet local à un projet Supabase distant
	@echo "$(BLUE)🔗 Liaison au projet Supabase...$(NC)"
	@read -p "Project Ref (depuis Dashboard): " project_ref; \
	docker-compose exec supabase-cli bash -c "cd /app && supabase link --project-ref $$project_ref"
	@echo "$(GREEN)✅ Projet lié$(NC)"

supabase-status: ## Affiche le statut de Supabase CLI
	@echo "$(BLUE)📊 Statut Supabase...$(NC)"
	docker-compose exec supabase-cli bash -c "cd /app && supabase status || supabase --version"

supabase-functions-new: ## Crée une nouvelle Edge Function
	@echo "$(BLUE)⚡ Création Edge Function...$(NC)"
	@read -p "Nom de la fonction: " function_name; \
	docker-compose exec supabase-cli bash -c "cd /app && supabase functions new $$function_name"
	@echo "$(GREEN)✅ Fonction créée dans supabase/functions/$(NC)"

supabase-functions-deploy: ## Déploie une Edge Function
	@echo "$(BLUE)🚀 Déploiement Edge Function...$(NC)"
	@read -p "Nom de la fonction: " function_name; \
	docker-compose exec supabase-cli bash -c "cd /app && supabase functions deploy $$function_name"
	@echo "$(GREEN)✅ Fonction déployée$(NC)"

supabase-db-dump: ## Export SQL complet de la DB distante
	@echo "$(BLUE)💾 Export SQL de Supabase...$(NC)"
	docker-compose exec supabase-cli bash -c "cd /app && supabase db dump -f supabase/backup_$$(date +%Y%m%d_%H%M%S).sql"
	@echo "$(GREEN)✅ Dump SQL créé$(NC)"

# === SUPABASE DIRECT (via psql - IPv4) ===

supabase-apply-rls: ## Applique les RLS policies directement via psql
	@echo "$(BLUE)🔒 Application des RLS policies...$(NC)"
	docker-compose --env-file envFiles/.env.development exec -T supabase-cli psql "$(DATABASE_URL)" < supabase/rls-policies.sql
	@echo "$(GREEN)✅ RLS policies appliquées$(NC)"

supabase-migrate-all: ## Applique toutes les migrations RLS (fichier par fichier)
	@echo "$(BLUE)🔒 Application des migrations RLS (15 tables)...$(NC)"
	@for file in supabase/migrations/202411130000*.sql; do \
		echo "$(BLUE)  → Applying $$(basename $$file)...$(NC)"; \
		docker-compose --env-file envFiles/.env.development exec -T supabase-cli psql "$(DATABASE_URL)" < "$$file" || exit 1; \
	done
	@echo "$(GREEN)✅ Toutes les migrations RLS appliquées$(NC)"

supabase-run-sql: ## Exécute un fichier SQL personnalisé
	@echo "$(BLUE)📝 Exécution SQL...$(NC)"
	@read -p "Fichier SQL (dans supabase/): " sql_file; \
	docker-compose --env-file envFiles/.env.development exec -T supabase-cli psql "$(DATABASE_URL)" < "supabase/$$sql_file"
	@echo "$(GREEN)✅ SQL exécuté$(NC)"

supabase-psql: ## Ouvre psql connecté à Supabase
	@echo "$(BLUE)🗄️  Connexion psql à Supabase...$(NC)"
	docker-compose --env-file envFiles/.env.development exec supabase-cli psql "$(DATABASE_URL)"

supabase-check-rls: ## Vérifie les RLS policies actives
	@echo "$(BLUE)🔍 Vérification RLS...$(NC)"
	@docker-compose --env-file envFiles/.env.development exec -T supabase-cli psql "$(DATABASE_URL)" -c "SELECT count(*) as policies_count FROM pg_policies WHERE schemaname='public';"
	@docker-compose --env-file envFiles/.env.development exec -T supabase-cli psql "$(DATABASE_URL)" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;"
	@echo "$(GREEN)✅ Vérification terminée$(NC)"

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

# === ENVIRONMENTS - SUPABASE ===

## DEVELOPMENT
dev-down: ## Arrête DEVELOPMENT
	docker-compose down

dev-logs: ## Logs DEVELOPMENT
	docker-compose logs -f --tail=100

dev-migrate: ## Migrer via Prisma (auto-génère SQL depuis schema.prisma)
	@echo "$(BLUE)🗄️  Migration Prisma...$(NC)"
	@read -p "Nom de la migration: " migration_name; \
	timestamp=$$(date +%Y%m%d%H%M%S); \
	migration_dir="prisma/migrations/$${timestamp}_$${migration_name}"; \
	mkdir -p "$$migration_dir"; \
	echo "$(BLUE)→ Génération SQL (diff)...$(NC)"; \
	docker run --rm -v $(PWD):/app -w /app --network host \
		-e DATABASE_URL="$$(grep DIRECT_URL envFiles/.env.development | cut -d= -f2)" \
		node:20-slim sh -c "apt-get update -qq && apt-get install -y -qq openssl >/dev/null 2>&1 && npm install -g prisma@5.22.0 >/dev/null 2>&1 && prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script" > "$$migration_dir/migration.sql"; \
	if [ ! -s "$$migration_dir/migration.sql" ]; then \
		echo "$(YELLOW)⚠️  Aucun changement détecté$(NC)"; \
		rm -rf "$$migration_dir"; \
		exit 1; \
	fi; \
	echo "$(GREEN)✅ SQL généré$(NC)"; \
	echo "$(BLUE)→ Application...$(NC)"; \
	docker-compose --env-file envFiles/.env.development exec -T supabase-cli psql "$(DATABASE_URL)" < "$$migration_dir/migration.sql"; \
	echo "$(GREEN)✅ Migration appliquée!$(NC)"

dev-migrate-deploy: ## Migrations DEVELOPMENT (migrate deploy - pour production)
	@echo "$(BLUE)🗄️  Migrations sur Supabase DEV...$(NC)"
	docker-compose --env-file envFiles/.env.development exec api-dev npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

dev-seed: ## Seed DEVELOPMENT
	@echo "$(BLUE)🌱 Seed Supabase DEV...$(NC)"
	docker-compose --env-file envFiles/.env.development exec api-dev npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

dev-studio: ## Prisma Studio DEVELOPMENT
	docker-compose --env-file envFiles/.env.development exec api-dev npx prisma studio

## STAGING
staging-up: ## Démarre en STAGING (Supabase)
	@echo "$(BLUE)🚧 Démarrage STAGING avec Supabase...$(NC)"
	@if [ ! -f envFiles/.env.staging ]; then echo "$(RED)❌ Fichier .env.staging manquant$(NC)"; exit 1; fi
	docker-compose -f docker-compose.staging.yml --env-file envFiles/.env.staging up -d --build
	@echo "$(GREEN)✅ Staging démarré$(NC)"

staging-down: ## Arrête STAGING
	docker-compose -f docker-compose.staging.yml down

staging-logs: ## Logs STAGING
	docker-compose -f docker-compose.staging.yml logs -f --tail=100

staging-migrate: ## Migrations STAGING
	@echo "$(BLUE)🗄️  Migrations sur Supabase STAGING...$(NC)"
	docker-compose -f docker-compose.staging.yml --env-file envFiles/.env.staging run --rm api npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

staging-seed: ## Seed STAGING
	@echo "$(BLUE)🌱 Seed Supabase STAGING...$(NC)"
	docker-compose -f docker-compose.staging.yml --env-file envFiles/.env.staging run --rm api npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

## PRODUCTION
prod-up: ## Démarre en PRODUCTION (Supabase)
	@echo "$(BLUE)🚀 Démarrage PRODUCTION avec Supabase...$(NC)"
	@if [ ! -f envFiles/.env.production ]; then echo "$(RED)❌ Fichier .env.production manquant$(NC)"; exit 1; fi
	docker-compose -f docker-compose.production.yml --env-file envFiles/.env.production up -d --build
	@echo "$(GREEN)✅ Production démarrée$(NC)"

prod-down: ## Arrête PRODUCTION
	docker-compose -f docker-compose.production.yml down

prod-logs: ## Logs PRODUCTION
	docker-compose -f docker-compose.production.yml logs -f --tail=100

prod-migrate: ## Migrations PRODUCTION
	@echo "$(BLUE)🗄️  Migrations sur Supabase PROD...$(NC)"
	docker-compose -f docker-compose.production.yml --env-file envFiles/.env.production run --rm api npx prisma migrate deploy
	@echo "$(GREEN)✅ Migrations appliquées$(NC)"

prod-seed: ## Seed PRODUCTION (⚠️  ATTENTION!)
	@echo "$(RED)⚠️  SEED EN PRODUCTION - Êtes-vous sûr? (Ctrl+C pour annuler)$(NC)"
	@sleep 3
	@echo "$(BLUE)🌱 Seed Supabase PROD...$(NC)"
	docker-compose -f docker-compose.production.yml --env-file envFiles/.env.production run --rm api npm run prisma:seed
	@echo "$(GREEN)✅ Seed terminé$(NC)"

# === QUICK START ===

quickstart: dev-up ## Démarrage rapide complet (Development)
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)  🎉 API DataFriday prête!$(NC)"
	@echo "$(GREEN)========================================$(NC)"
	@echo ""
	@echo "  📍 API:           http://localhost:3000/api/v1"
	@echo "  🏥 Health check:  http://localhost:3000/api/v1/health"
	@echo "  🎨 Prisma Studio: make dev-studio"
	@echo ""
	@echo "$(BLUE)📝 Commandes utiles:$(NC)"
	@echo "  make dev-logs     - Voir les logs"
	@echo "  make dev-studio   - Interface DB"
	@echo "  make dev-down     - Arrêter"
	@echo ""

# === DOCUMENTATION ===

organize-docs: ## Organise les fichiers de documentation
	@echo "$(BLUE)📚 Organisation de la documentation...$(NC)"
	@mkdir -p docs/getting-started docs/architecture docs/api docs/weezevent docs/testing
	@mv docs/SETUP.md docs/getting-started/ 2>/dev/null || true
	@mv docs/DEVELOPMENT.md docs/getting-started/ 2>/dev/null || true
	@mv docs/ENVIRONMENTS.md docs/getting-started/ 2>/dev/null || true
	@mv docs/ARCHITECTURE.md docs/architecture/ 2>/dev/null || true
	@mv docs/API_ARCHITECTURE.md docs/architecture/ 2>/dev/null || true
	@mv docs/DATA_SOURCES.md docs/architecture/ 2>/dev/null || true
	@mv docs/SUPABASE.md docs/architecture/ 2>/dev/null || true
	@mv docs/DATABASE.md docs/architecture/ 2>/dev/null || true
	@mv docs/SCALABLE_ARCHITECTURE.md docs/architecture/ 2>/dev/null || true
	@mv docs/API_REFERENCE.md docs/api/ 2>/dev/null || true
	@mv docs/API_VERSIONING.md docs/api/ 2>/dev/null || true
	@mv docs/API_MIGRATION_V1.md docs/api/ 2>/dev/null || true
	@mv docs/FRONTEND_API_GUIDE.md docs/api/ 2>/dev/null || true
	@mv docs/SPACES_API_GUIDE.md docs/api/ 2>/dev/null || true
	@mv docs/AUTH_QUICKSTART.md docs/auth/ 2>/dev/null || true
	@mv docs/AUTH_TESTING_GUIDE.md docs/auth/ 2>/dev/null || true
	@mv docs/WEEZEVENT_*.md docs/weezevent/ 2>/dev/null || true
	@mv docs/SPACES_TESTING_GUIDE.md docs/testing/ 2>/dev/null || true
	@rm -f docs/INDEX.md 2>/dev/null || true
	@mv docs/INDEX_RESTRUCTURED.md docs/INDEX.md 2>/dev/null || true
	@rm -f "docs/figmq bd.txt" 2>/dev/null || true
	@rm -f "docs/API Reference _ Weezevent.mhtml" 2>/dev/null || true
	@echo "$(GREEN)✅ Documentation organisée!$(NC)"
