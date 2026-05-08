# 🏗️ HEOS Architecture - Guide de Démarrage Rapide

## Prérequis

- **Docker Desktop** : Assurez-vous que Docker est démarré
- **Node.js 18+** : Pour les tests locaux sans Docker
- **npm** ou **pnpm** : Gestionnaire de paquets

## 🚀 Installation

### Option 1: Via Docker (Recommandé)

```bash
# 1. Démarrer Docker Desktop

# 2. Démarrer l'architecture HEOS complète
make heos-dev

# 3. Vérifier que tout fonctionne
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/detailed
```

### Option 2: Installation locale

```bash
# 1. Installer les dépendances
pnpm install

# 2. Installer les dépendances HEOS
pnpm add @nestjs/bullmq bullmq ioredis

# 3. Démarrer Redis (via Docker ou local)
docker run -d -p 6379:6379 --name redis redis:7-alpine

# 4. Configurer les variables d'environnement
cp envFiles/.env.example envFiles/.env.development
# Ajouter: REDIS_URL=redis://localhost:6379

# 5. Démarrer l'API
pnpm run start:dev
```

## 🧪 Lancer les Tests

### Via Docker
```bash
# Tests unitaires HEOS
make test-heos

# Tests avec couverture
make test-heos-coverage

# Tests en mode watch
make test-heos-watch
```

### En local
```bash
# Tous les tests HEOS
npm test -- --testPathPattern='(redis|queue|orchestrator)'

# Tests spécifiques
npm test -- --testPathPattern='redis.service.spec'
npm test -- --testPathPattern='queue.service.spec'
npm test -- --testPathPattern='orchestrator.service.spec'

# Avec couverture
npm test -- --testPathPattern='(redis|queue|orchestrator)' --coverage
```

## 📊 Monitoring

### Bull Board (Queue Monitoring)
```bash
# Démarrer Bull Board
make bull-board

# Accéder à l'interface
open http://localhost:3001
```

### Redis CLI
```bash
# Ouvrir Redis CLI
make redis-cli

# Commandes utiles dans Redis CLI
> KEYS datafriday:*     # Lister les clés
> INFO                  # Stats Redis
> MONITOR               # Voir les commandes en temps réel
```

## 🔍 Endpoints de Test

### Health Check
```bash
# Basic health
curl http://localhost:3000/api/v1/health

# Detailed health (Redis + Queues)
curl http://localhost:3000/api/v1/health/detailed
```

### Orchestrator
```bash
# Obtenir la stratégie de traitement
curl "http://localhost:3000/api/v1/orchestrator/strategy?tenantId=test&operation=sync&estimatedItems=500"

# Health check des backends
curl http://localhost:3000/api/v1/orchestrator/health
```

### Swagger Documentation
```bash
open http://localhost:3000/api/v1/docs
```

## 📁 Structure des Fichiers de Test

```
src/
├── core/
│   ├── redis/
│   │   ├── redis.service.ts
│   │   └── redis.service.spec.ts     # ✅ Tests Redis
│   └── queue/
│       ├── queue.service.ts
│       ├── queue.service.spec.ts     # ✅ Tests Queue
│       └── processors/
│           ├── data-sync.processor.spec.ts    # ✅ Tests Sync
│           └── analytics.processor.spec.ts    # ✅ Tests Analytics
└── features/
    └── orchestrator/
        ├── orchestrator.service.spec.ts      # ✅ Tests Orchestrator
        └── orchestrator.controller.spec.ts   # ✅ Tests Controller
```

## 🔧 Commandes Makefile Disponibles

| Commande | Description |
|----------|-------------|
| `make heos-dev` | Démarre HEOS en développement |
| `make heos-up` | Démarre HEOS en production |
| `make heos-down` | Arrête tous les services HEOS |
| `make heos-logs` | Affiche les logs HEOS |
| `make redis-up` | Démarre Redis seul |
| `make redis-cli` | Ouvre Redis CLI |
| `make bull-board` | Démarre le monitoring des queues |
| `make test-heos` | Lance les tests HEOS |
| `make test-heos-coverage` | Tests avec couverture |

## ❓ Troubleshooting

### Docker ne démarre pas
```bash
# Vérifier que Docker Desktop est lancé
docker info

# Redémarrer Docker
# Sur macOS: Ouvrir Docker Desktop et le relancer
```

### Redis ne se connecte pas
```bash
# Vérifier que Redis est accessible
redis-cli ping
# Doit répondre: PONG

# Vérifier la variable d'environnement
echo $REDIS_URL
# Doit afficher: redis://localhost:6379
```

### Les tests échouent
```bash
# Regénérer les modules
pnpm run prisma:generate

# Nettoyer le cache Jest
pnpm test -- --clearCache

# Relancer les tests
pnpm test -- --testPathPattern='(redis|queue|orchestrator)'
```
