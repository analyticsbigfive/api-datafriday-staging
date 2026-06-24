# 🔴→🟢 Réarmement (`RestockState`) — table à appliquer en PROD + correctifs code

**Pour : équipe backend `datafriday-api`**
**Date : 2026-06-24 (mis à jour après audit du repo)**
**Priorité : haute — endpoint en 500 en production**

> ⚠️ Ce document corrige une version précédente qui supposait une « migration
> jamais générée » et recommandait `git add prisma/migrations`. **C'est faux dans
> ce repo** : le modèle, la migration et le code existent déjà ; et les migrations
> sont **volontairement gitignorées** (voir §2). La bonne procédure est en §5.

---

## 1. Le symptôme (constaté en prod)

```
GET  /api/v1/spaces/:spaceId/restock-state   → 500
PUT  /api/v1/spaces/:spaceId/restock-state   → 500
```

```json
{
  "statusCode": 500,
  "message": "Invalid `prisma.restockState.findUnique()` invocation:\n\nThe table `public.RestockState` does not exist in the current database.",
  "method": "GET"
}
```

Ce n'est ni un 401, ni un bug front : la route existe, le code Prisma s'exécute,
mais la table physique `public.RestockState` **n'existe pas dans la base de prod**.

## 2. La vraie cause (différente de la 1re version du doc)

Ce qui existe **déjà et est commité** (`54fe80b`) :

- modèle `RestockState` dans `prisma/schema.prisma` ;
- migration `prisma/migrations/20260622100000_add_restock_state/migration.sql`
  (idempotente, `CREATE TABLE IF NOT EXISTS` + index) ;
- `RestockStateController` / `Service` / `Module` / `Dto`, enregistrés dans
  `app.module.ts` ; route exposée sous le préfixe `api/v1`.

**Pourquoi la table manque quand même en prod :** le `.gitignore` ignore **toutes**
les migrations :

```gitignore
# Prisma
prisma/migrations/*
!prisma/migrations/.gitkeep
```

Conséquences :

1. Les fichiers de migration **ne sont jamais poussés** sur le checkout Render.
   Donc le `npx prisma migrate deploy` du `render.yaml` (startCommand) tourne sur
   un dossier `migrations/` vide → **no-op**. Le `migrate deploy` de Render est
   purement décoratif dans ce projet.
2. Les migrations sont en réalité appliquées **manuellement** depuis un poste dev
   via les cibles Makefile `make staging-migrate` / `make prod-migrate` (qui
   utilisent les fichiers locaux + `envFiles/.env.*`).

➡️ **La table manque simplement parce que personne n'a lancé `make prod-migrate`
après avoir créé la migration le 22/06.** Ce n'est pas un bug de génération.

> 🚨 La recommandation « `git add prisma/migrations && git commit` » de la version
> précédente **n'ajoute rien** (tout est gitignoré) → n'atteint jamais Render →
> ne corrige pas la prod. Ne pas suivre cette voie sans `git add -f` **et** sans
> revoir la stratégie de migration (cf. §7).

⚠️ **3 autres migrations sont dans le même cas** (non trackées, donc potentiellement
absentes/partielles en prod) :
`20260618000001_add_inventory_module_and_weezevent_config_id`,
`20260618100000_inventory_snapshot_kv_predict_versions`,
`20260622000000_add_selected_time_range_to_event_predict_version`.
`make prod-migrate` les rattrape toutes, dans l'ordre.

## 3. Pourquoi le front a besoin de cette table

L'état du Réarmement (objectif, events sélectionnés, ajustements de stock, lignes
confirmées, feuille de course…) est aujourd'hui persisté **uniquement en
`localStorage`**. Sans table : perte de l'état au changement de machine / vidage de
cache, et aucune synchro entre postes d'un même `space`. La table rend l'**API
source autoritaire** ; le `localStorage` reste un filet offline. Contrat :
[`docs/restockState.api.md`](./restockState.api.md).

## 4. Schéma (déjà présent)

```prisma
model RestockState {
  id        String   @id @default(cuid())
  tenantId  String
  spaceId   String
  state     Json
  createdBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, spaceId])   // upsert idempotent
  @@index([tenantId])
  @@index([spaceId])
}
```

- un seul état par `(tenantId, spaceId)` → contrainte `@@unique` ;
- `state` = **jsonb opaque** (pas de validation champ par champ, cf. §6) ;
- `GET` sans état → **`200` body vide/`null`** (même convention que
  `GET /inventory/:spaceId/latest`), jamais `404`.

## 5. Correctif PROD (à exécuter — 1 seule étape)

### Solution recommandée : appliquer la migration existante

Depuis un poste ayant `envFiles/.env.production` + accès à la base de prod :

```bash
make prod-migrate
# = docker-compose -f docker-compose.production.yml --env-file envFiles/.env.production \
#     run --rm api npx prisma migrate deploy
```

Applique proprement la migration locale `20260622100000_add_restock_state` (et les
3 autres en attente), et les enregistre dans `_prisma_migrations`.

### Fallback (pas d'accès Makefile / Docker) : DDL brut

La migration est idempotente ; ce DDL est sûr (additif, aucune perte) :

```sql
CREATE TABLE IF NOT EXISTS public."RestockState" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "spaceId"   TEXT NOT NULL,
    "state"     JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RestockState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RestockState_tenantId_spaceId_key"
    ON public."RestockState" ("tenantId", "spaceId");
CREATE INDEX IF NOT EXISTS "RestockState_tenantId_idx" ON public."RestockState" ("tenantId");
CREATE INDEX IF NOT EXISTS "RestockState_spaceId_idx"  ON public."RestockState" ("spaceId");
```

> Si tu passes par le DDL brut sans `make prod-migrate`, `_prisma_migrations` ne
> contiendra pas l'entrée → un futur `migrate deploy` la rejouera (sans danger ici,
> car `IF NOT EXISTS`). Préférer `make prod-migrate` pour garder l'historique propre.

## 6. Correctifs CODE appliqués (sinon le PUT renverrait 400 après création table)

Deux régressions latentes corrigées côté backend (sans elles, créer la table
n'aurait pas suffi — le `PUT` aurait échoué en **400**) :

- **Enum trop strict** : le DTO imposait `objectiveSource ∈ {sales, forecast}`,
  alors que le front envoie aussi `'prediction'`. → enum **dé-figée**.
- **Blob non opaque** : le `ValidationPipe` global
  (`whitelist` + `forbidNonWhitelisted`) — qui s'exécute **avant** tout pipe de
  route — rejetait/strippait tout champ hors des 9 du DTO, contredisant le contrat
  « `state` = jsonb opaque ». → le body du `PUT` est désormais typé en **objet
  libre** (le pipe global ignore les types natifs), validé a minima (« objet JSON »)
  côté service ; le DTO ne sert plus qu'à la **doc Swagger** (`@ApiBody`).

Fichiers : `src/features/restock-state/{controller,service,dto}`.

## 7. Dette structurelle (décision à prendre, hors urgence)

Le `prisma migrate deploy` de `render.yaml` est inopérant tant que les migrations
sont gitignorées : tout déploiement Render **n'applique aucune migration**. Deux
options à trancher en équipe (ne PAS flipper à l'aveugle) :

- **A.** Garder le workflow manuel `make *-migrate` et **documenter** que Render
  n'applique rien (le `migrate deploy` du `render.yaml` est trompeur → le retirer
  ou ajouter un commentaire).
- **B.** Dé-ignorer `prisma/migrations/*`, committer les migrations, pour que Render
  applique automatiquement. ⚠️ nécessite de vérifier l'état de `_prisma_migrations`
  en prod (baseline / checksums) avant, sinon `migrate deploy` peut échouer.

## 8. Vérification

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  https://datafriday-api.onrender.com/api/v1/spaces/<SPACE_ID>/restock-state
# attendu : 200 (body vide/null si aucun état)
```

Puis un `PUT` avec `objectiveSource: "prediction"` et un champ inconnu doit
renvoyer **200** (plus de 400), et l'état se synchronise entre machines.
