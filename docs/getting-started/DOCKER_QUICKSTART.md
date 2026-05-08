# 🐳 Docker Quick Start

## Prérequis

- Docker Desktop installé et démarré
- Fichier `envFiles/.env.development` configuré (copier depuis `.env.example`)

## Démarrage rapide

### 1. Démarrer l'API en mode développement

```bash
make dev-up
```

L'API sera accessible sur **http://localhost:3000/api/v1**

### 2. Démarrer le Frontend

```bash
docker-compose --env-file envFiles/.env.development --profile frontend up -d frontend-dev
```

Le frontend sera accessible sur **http://localhost:5173**

### 3. Accéder à l'interface Weezevent

Une fois connecté, naviguez vers : **http://localhost:5173/weezevent**

## Commandes utiles

### Voir les logs

```bash
# API
docker-compose logs api-dev -f

# Frontend
docker-compose logs frontend-dev -f
```

### Arrêter les services

```bash
# API
docker-compose --profile dev down

# Frontend
docker-compose --profile frontend down

# Tout arrêter
docker-compose down
```

### Reconstruire les images

```bash
# Reconstruire l'API
docker-compose --env-file envFiles/.env.development build api-dev

# Reconstruire le frontend
docker-compose --env-file envFiles/.env.development build frontend-dev
```

## Ports utilisés

| Service | Port | URL |
|---------|------|-----|
| API Dev | 3000 | http://localhost:3000 |
| API Prisma Studio | 5555 | http://localhost:5555 |
| Frontend Dev | 5173 | http://localhost:5173 |

## Sync Weezevent Incrémental

Le système de synchronisation incrémentale Weezevent est maintenant activé :

- **Sync automatique** : CRON jobs configurés dans `weezevent-cron.service.ts`
  - Transactions : toutes les 10 minutes
  - Événements : quotidiennement à 3h
  - Sync complet : hebdomadaire (dimanche 2h)

- **Sync manuel** : Via l'interface `/weezevent`
  - Bouton "Sync Complet" ou par type (événements/produits/transactions)
  - Toggle "Forcer sync complet" pour ignorer l'état incrémental

## Troubleshooting

### Erreur "Cannot find module '@nestjs/schedule'"

Reconstruire l'image :
```bash
docker-compose --profile dev down
docker-compose --env-file envFiles/.env.development build api-dev
make dev-up
```

### Prisma Client out of sync

```bash
docker-compose exec api-dev npx prisma generate
```

### Frontend ne se connecte pas à l'API

Vérifier que `VITE_API_URL` dans le docker-compose.yml pointe vers `http://localhost:3000/api/v1`
