# Analyse complète & plan de correction — Wizard d'intégration Weezevent

> **Périmètre** : deux dépôts — Backend NestJS/Prisma (`api-datafriday-staging`) et Frontend Vue (`datafriday-web`).
> **Date** : 2026-06-26. **Sources** : 54 anomalies vérifiées de façon adversariale + relecture du code réel.

---

## 1. Résumé exécutif

Le flux d'intégration Weezevent souffre d'**un défaut fonctionnel structurant** : la zone `externalmerch` est cliquable côté frontend mais provoque un **HTTP 500 garanti** côté backend (requête Prisma `level: 'externalmerch'` sur un champ `Int`). À cela s'ajoute une **collision de namespace** entre la config interne `"Weezevent Import"` et la config utilisateur (nommée par défaut `'weezevent import'`), qui masque silencieusement la config de l'utilisateur. Le reste est constitué de dette de contrat (OpenAPI figé périmé, absence de DTO de validation, formes de réponse asymétriques) et de petits défauts UX/robustesse. **Aucune corruption de données systématique** : les échecs sont contenus (lecture avant écriture, catch frontend, mappings idempotents).

Les 54 anomalies se dédupliquent en **~22 défauts distincts** (beaucoup décrivent le même bug `externalmerch` ou la même absence de `isSystem` sous des angles différents).

### Tableau de criticité (après dédoublonnage)

| ID consolidé | Thème | Sévérité | Couche | Phase |
|---|---|---|---|---|
| A1 — Crash `externalmerch` sur `assign-floor` | assign-floor | **High** | backend | P0 |
| A2 — Collision nom `weezevent import` (config user masquée) | isSystem/filtrage | **High** | frontend+backend | P0 |
| A3 — `getConfiguration` ne renvoie pas `externalMerch` (perte de données) | écriture config user | **High** | backend | P0 |
| A4 — Absence de validation DTO sur `assign-floor` / `quick-element` | validation | **Medium** | backend | P1 |
| A5 — Tri incohérent `getConfigurations` (desc) vs `findOne` (asc) | config | **High** | backend | P1 |
| A6 — Modèle `Config` sans `isSystem` (filtrage fragile) | isSystem/filtrage | **Medium** | schema | P1 |
| A7 — Duplication route `quick-element` (spaces vs configurations) | quick-element/URL | **Medium** | backend | P2 |
| A8 — OpenAPI figé périmé (`assign-floor`, `quick-element`, `/shops`, `step4-context`, double préfixe dashboard) | OpenAPI | **Low→Medium** | openapi | P2 |
| A9 — `defaultElementPosition()` ignore ses arguments (shops empilés) | autres | **Medium** | frontend | P2 |
| A10 — `saveConfiguration` perd les `MenuAssignment` (cascade) | écriture config user | **Medium** | backend | P2 |
| A11 — `skipPostCreate` → progression sans config user | autres | **Medium** | frontend | P2 |
| A12 — Erreurs de mapping silencieuses (`bulkCreateAndMap`) | autres | **Medium** | frontend | P2 |
| A13 — Double préfixe `/api/v1/api/v1/...dashboard` | OpenAPI/routing | **Medium** | backend | P2 |
| A14 — `Error` générique au lieu d'exceptions NestJS (500 vs 404) | autres | **Low** | backend | P3 |
| A15 — Réponses `assign-floor` asymétriques floor/forecourt | contrat | **Low** | backend | P3 |
| A16 — Floor nommé `'Import'` au lieu de `'RDC'` (label trompeur) | autres | **Low** | backend | P3 |
| A17 — `type` non validé → fallback silencieux `'other'` | quick-element | **Low** | backend | P3 |
| A18 — `name` vide accepté (shop sans nom) | quick-element | **Low** | backend | P3 |
| A19 — `hasMappings` / `checkMappings()` code mort | autres | **Low** | frontend | P3 |
| A20 — `POST /configurations` upsert (devrait être PATCH) | openapi | **Low** | frontend | P3 |
| A21 — Race condition sync `config.data` JSON (multi-acteurs) | écriture config user | **Low** | backend | P3 |
| A22 — `configId` non propagé aux étapes suivantes | autres | **Low** | frontend | P3 |

---

## 2. Anomalies détaillées (regroupées par thème)

### Thème 1 — assign-floor / externalmerch

#### A1 — Crash `externalmerch` (HTTP 500) — **High**
- **Symptôme utilisateur** : en étape 2, choisir/créer une zone « External Merch » et valider l'assignation déclenche une erreur générique ; aucun shop n'est assigné. Fonctionnalité 100 % cassée sur ce chemin.
- **Cause racine** :
  - Frontend émet `'externalmerch'` : `StepMapShops.vue:305` (`@click="floorDialogLevel = 'externalmerch'"`), `:1100` (`resolveNewZoneLevel`), envoyé en `:1286` via `assignShopsFloor` → `space.api.js:248-249`.
  - Aucune validation : `spaces.controller.ts:796` utilise un **type inline** `{ elementIds: string[]; level: number | 'forecourt' }` (pas une classe DTO) → le `ValidationPipe` global (`main.ts:76-82`) est **inopérant**.
  - `spaces.service.ts:2031-2058` : `'externalmerch'` n'est ni `'forecourt'` ni un nombre → tombe dans la branche floor → `prisma.floor.findFirst({ where: { configId, level: 'externalmerch' } })` sur `Floor.level Int` (`schema.prisma:493`) → `PrismaClientValidationError` → 500 (non `HttpException`, mappé en 500 par `all-exceptions.filter.ts:34-37`).
- **Couche** : backend (+ contrat frontend).
- **Correction recommandée** (décision produit requise) :
  - **Option A (recommandée court terme)** : rejet propre. Élargir la signature `level: number | 'forecourt' | 'externalmerch'`, et **avant** la logique floor :
    ```ts
    // spaces.service.ts, début de assignElementsToFloorLevel
    if (level === 'externalmerch') {
      throw new BadRequestException("La zone 'externalmerch' n'est pas supportée par assign-floor");
    }
    ```
    Côté frontend : ne PAS appeler `assignShopsFloor` pour `'externalmerch'` (le placement visuel JSON via `updateConfiguration` suffit, cf. A3).
  - **Option B (complète)** : nouveau modèle Prisma `ExternalMerch` (analogue à `Forecourt`) + FK `SpaceElement.externalMerchId` + `assignElementsToExternalMerch` + branche dédiée. **Migration Prisma** + revue de toutes les lectures `floor||forecourt`.
- ⚠️ Ne PAS se contenter d'ajouter `'externalmerch'` à l'enum OpenAPI/union de type : il n'existe **aucun modèle relationnel** ExternalMerch, et `@IsUnion()` n'existe pas en class-validator.

#### A4 — Absence de validation DTO sur `assign-floor` (et `quick-element`) — **Medium**
- **Symptôme** : `elementIds: null` → `TypeError` ; `level` arbitraire → 500 Prisma ; `elementIds: []` → floor/config orphelins créés sans mise à jour. Réponses 500 au lieu de 400.
- **Cause racine** : `spaces.controller.ts:793-799` (et `:778`, `:1001`) utilisent des **types inline** → pas de class-validator.
- **Couche** : backend.
- **Correction** : créer une vraie classe DTO :
  ```ts
  export class AssignElementsToFloorDto {
    @IsArray() @ArrayNotEmpty() @IsString({ each: true }) elementIds: string[];
    @Validate(IsIntOrForecourt) level: number | 'forecourt';   // validateur custom (PAS @IsUnion)
  }
  ```
  + garde service défensive : après la branche forecourt, `if (typeof level !== 'number' || !Number.isInteger(level)) throw new BadRequestException(...)`.
- ⚠️ `@IsInt`/`@IsEnum([...])` combinés ne valident PAS une union `int|'forecourt'` (ET logique). Utiliser un validateur custom. Conserver `level: 0` et négatifs (RDC/sous-sols) → pas de `@IsPositive`.

#### A15 — Réponses asymétriques floor/forecourt — **Low**
- **Symptôme** : aucun (le frontend ignore le corps de réponse, cf. commentaires `StepMapShops.vue:1150-1184`). Dette de contrat.
- **Cause racine** : `spaces.service.ts:2175` retourne `{ floorId, floorName, level, updatedElementIds }` ; `:2310` retourne `{ forecourtId, forecourtName, updatedElementIds }` (sans `level`, clés différentes).
- **Correction** : union discriminée additive (ne PAS renommer les clés existantes) :
  ```ts
  // floor
  return { kind: 'floor', floorId, floorName, level, updatedElementIds };
  // forecourt
  return { kind: 'forecourt', forecourtId, forecourtName, level: null, updatedElementIds };
  ```

#### A14 — `Error` générique au lieu d'exceptions NestJS — **Low**
- **Cause racine** : `spaces.service.ts:2037` et `:2184` (+ `:1924`, `:1896/:1901`) lèvent `throw new Error('Space not found or access denied')` → 500 au lieu de 404/403. `NotFoundException`/`ForbiddenException` déjà importés.
- **Correction** : remplacer par `throw new NotFoundException('Space not found or access denied')`.
- ⚠️ Vérifier qu'aucun intercepteur axios ne branche sur le code 500.

---

### Thème 2 — quick-element / duplication d'URL

#### A7 — Duplication route `quick-element` — **Medium**
- **Symptôme** : aucun runtime ; sémantique trompeuse (sous `@Controller('configurations')`, `:id` est traité comme un **spaceId**, contrairement à toutes les autres routes du contrôleur).
- **Cause racine** : `spaces.controller.ts:748` (`@Controller('spaces')`) et `:971` (`@Controller('configurations')`) — handlers identiques appelant `quickCreateElement(spaceId, tenantId, body)`. Le frontend n'utilise QUE `/spaces/:id/quick-element` (`space.api.js:228`).
- **Correction** : supprimer le doublon `/configurations/:id/quick-element` (`:971-1004`), conserver la variante `/spaces`, puis régénérer l'OpenAPI.

#### A17 — `type` non validé → `'other'` silencieux — **Low**
- **Cause racine** : `spaces.service.ts:1947` `mapElementType(dto.type || 'shop')` ; `:1604` `return 'other'` pour tout type inconnu. `{name:"x", type:123}` → `TypeError: type.startsWith` (`:1553`).
- **Correction** : DTO `@IsOptional() @IsString() @IsIn([...liste alignée sur mapElementType...])` + durcir `mapElementType` (`if (typeof type !== 'string') return 'other';`).
- ⚠️ La liste `@IsIn` doit couvrir TOUS les types réellement émis (préfixes `fnb-*`, `merch-*`, etc.) sinon régression.

#### A18 — `name` vide accepté — **Low**
- **Cause racine** : `spaces.service.ts:1953` `name: dto.name` non validé → SpaceElement avec `name: ''` (shop illisible). `name: null`/absent → 500 Prisma.
- **Correction** : DTO `@IsString() @IsNotEmpty() name` ou garde service `if (!dto?.name?.trim()) throw new BadRequestException(...)`.

> **Note de dédoublonnage** : A4, A17, A18 partagent la même cause racine (type inline `@Body()` non validé). Une seule passe de DTO sur les 3 endpoints (`assign-floor`, `quick-element` ×2) les corrige ensemble.

---

### Thème 3 — isSystem / filtrage de config

#### A2 — Collision de nom `weezevent import` — **High**
- **Symptôme** : si l'utilisateur valide le nom **par défaut** proposé par le wizard, sa propre config disparaît du sélecteur d'étage en étape 2 (dead-end : « Aucune configuration disponible »), placement visuel impossible.
- **Cause racine** :
  - Backend crée la config interne en PascalCase `'Weezevent Import'` (`spaces.service.ts:1928/1934`, `:2047/2051`, `:2188/2192`, case-sensitive).
  - Frontend pré-remplit la config UTILISATEUR avec `'weezevent import'` (lowercase) : `StepMapSpace.vue:481`, `:639`, `:690`.
  - Filtre frontend **insensible à la casse** : `StepMapShops.vue:607` `.filter(c => c.name?.toLowerCase() !== 'weezevent import')` → masque la config utilisateur.
  - Aucune contrainte `@@unique([spaceId, name])` ni champ discriminant sur `Config`.
- **Couche** : frontend + backend (schema).
- **Correction (deux volets)** :
  1. **Immédiat (frontend seul)** : changer le défaut `StepMapSpace.vue:481/639/690` → nom neutre (ex. dérivé du nom du space). Garde-fou : interdire `name.trim().toLowerCase() === 'weezevent import'` dans `handleConfirmConfig`.
  2. **Durable** : flag `isSystem` (cf. A6) + filtre `.filter(c => !c.isSystem)`.

#### A6 — Modèle `Config` sans `isSystem` — **Medium**
- **Symptôme** : filtrage fragile par nom ; tout renommage/traduction casse le filtre.
- **Cause racine** : `schema.prisma:470-485` — `Config` = `{ id, name, spaceId, capacity, data, createdAt, updatedAt }` + relations, **pas de `isSystem`** (alors que `Permission:365` et `Role:386` l'ont déjà). `getConfigurations` (`spaces.service.ts:694-707`) ne renvoie aucun discriminant.
- **Couche** : schema → backend → frontend.
- **Correction** :
  ```prisma
  model Config {
    ...
    isSystem  Boolean  @default(false)  // true = auto-généré (import Weezevent)
  }
  ```
  - Backend : `isSystem: true` aux 3 `config.create` internes ; remplacer les `findFirst({ name: 'Weezevent Import' })` par `findFirst({ spaceId, isSystem: true })` ; exposer `isSystem` dans `getConfigurations`, `getConfiguration`, `getSpace`.
  - Frontend : `StepMapShops.vue:607` → `.filter(c => !c.isSystem)`.
  - Factoriser le nom en constante partagée `WEEZEVENT_IMPORT_CONFIG_NAME`.

#### A5 — Tri incohérent `getConfigurations` — **High**
- **Symptôme** : à l'ouverture du Space Builder après le wizard, la config par défaut sélectionnée (`configs[0]`) est la config interne « Weezevent Import » (plan vide, floor « Import » level 0, éléments à x:0,y:0) au lieu de la config utilisateur.
- **Cause racine** : `spaces.service.ts:692` `orderBy: { createdAt: 'desc' }` (la plus récente = import en premier) contredit `findOne` `:260-262` `orderBy: { createdAt: 'asc' }` (commentaire : « oldest first so user-created configs precede auto-generated »). `SpaceBuilderViewRoute.vue:1305` fait `selectedConfigId = configs[0].id` sans re-tri.
- **Correction** : `getConfigurations` → `orderBy: { createdAt: 'asc' }` ; durable : `orderBy: [{ isSystem: 'asc' }, { createdAt: 'asc' }]` dans les deux méthodes.

---

### Thème 4 — OpenAPI / contrat

#### A8 — OpenAPI figé périmé — **Low→Medium**
- **Symptôme** : aucun impact runtime (le frontend câble les routes en dur). Impact : génération de clients/SDK incomplète, checks CI trompeurs.
- **Cause racine** : `datafriday-web/openapi.json` est un **snapshot figé périmé**. Endpoints absents bien que **décorés** dans le contrôleur : `POST /spaces/{id}/assign-floor` (`:786-792`), `POST /spaces/{id}/quick-element` (`:748-774`), `GET /spaces/{id}/shops` (`:391-434`), `GET /aggregation/step4-context/{spaceId}`, `PATCH /configurations/{id}`. Seule la variante `/configurations/{id}/quick-element` est documentée (sans même son schéma de réponse 201).
- **Correction** : **régénérer** `openapi.json` depuis le spec live (`GET /api/v1/openapi.json`, `main.ts:215`), **pas** d'édition manuelle. Automatiser en CI pour éviter la dérive.
- ⚠️ La régénération produira un gros diff (toutes les dérives accumulées) — relire attentivement.

#### A13 — Double préfixe `/api/v1/api/v1/...dashboard` — **Medium**
- **Symptôme** : les 4 endpoints Space Dashboard (dashboard, health, invalidate, rebuild) sont servis sous `/api/v1/api/v1/...` → 404 pour tout client suivant la convention normale.
- **Cause racine** : `dashboard.controller.ts:25` **hardcode** `@Controller('api/v1/spaces/:spaceId/dashboard')` alors que `main.ts:103` applique déjà `setGlobalPrefix('api/v1')`.
- **Correction** : `@Controller('spaces/:spaceId/dashboard')` puis régénérer l'OpenAPI.

#### A20 — `POST /configurations` upsert au lieu de PATCH — **Low**
- **Cause racine** : `configuration.api.js:70` `api.post('/configurations', {...data, id})` → upsert (`spaces.service.ts:1206`). Renvoie 201 même sur update.
- **Correction (frontend seul)** : `PATCH /configurations/:id` **existe déjà** (`spaces.controller.ts:912-928`). Remplacer par `api.patch(\`/configurations/${id}\`, configurationData)`. Documenter PATCH dans openapi.json.
- ⚠️ Touche aussi le SpaceBuilder hors wizard (`SpaceBuilderViewRoute.vue` ×5) — tester la sauvegarde de config.

---

### Thème 5 — Écriture de la config utilisateur

#### A3 — `getConfiguration` ne renvoie pas `externalMerch` (perte de données) — **High**
- **Symptôme** : à chaque réassignation en zone externe, les éléments externalMerch précédents sont écrasés (perte de données), et la zone est invisible au rechargement.
- **Cause racine** : `getConfiguration` (`spaces.service.ts:1775-1787`) reconstruit `data: { floors, forecourt }` mais **omet `externalMerch`**, pourtant stocké par `saveConfiguration` (qui persiste `dto.data` complet) et documenté (`create-config.dto.ts:55`, `controller:271`). `placeElementsOnFloor` (`StepMapShops.vue:1177`) lit donc toujours `undefined` puis réécrit une zone vide.
- **Couche** : backend (lecture).
- **Correction** :
  ```ts
  // spaces.service.ts:1775-1787
  data: { floors: jsonFloors, forecourt: jsonData?.forecourt || null, externalMerch: jsonData?.externalMerch || null }
  ```
- ⚠️ Ne PAS chercher à corriger `assignElementsToFloorLevel` (il écrit la config INTERNE, pas la config user). Le vrai défaut est l'omission en LECTURE. À traiter conjointement avec A1 (le flux externalmerch crashe de toute façon côté backend interne).

#### A10 — `saveConfiguration` perd les `MenuAssignment` — **Medium**
- **Symptôme** : créer des menu assignments sur un shop importé puis sauvegarder via Space Builder la config qui l'héberge → assignments perdus.
- **Cause racine** : `spaces.service.ts:1318` `tx.floor.deleteMany` → cascade `Floor → SpaceElement → MenuAssignment` (`schema.prisma`). `saveConfiguration` re-crée performance/staff/inventory depuis le JSON, mais **jamais** les `MenuAssignment` (non sérialisés par `getConfiguration`).
- **Correction (ciblée)** : avant `deleteMany`, capturer `tx.menuAssignment.findMany({ where: { element: { floor: { configId } } } })`, puis ré-insérer via `createMany({ skipDuplicates: true })` après recréation (les ids d'éléments sont préservés via `:1346`). Idem pour staff/inventory/performance des éléments ré-injectés par le garde-fou orphelins.
- ⚠️ Respecter `@@unique([elementId, menuItemId])` et la relation 1-1 `ElementPerformance` (éviter doublons).

#### A21 — Race condition sync `config.data` JSON — **Low**
- **Symptôme** : deux acteurs concurrents sur le même space → last-write-wins sur la projection JSON (FK relationnelles préservées, donc incohérence visuelle récupérable).
- **Cause racine** : read-modify-write non atomique `spaces.service.ts:2093` (relecture) → `:2167` (réécriture), sans transaction ni lock ni champ `version`. Sérialisé par l'UI dans le flux nominal.
- **Correction** : verrouillage optimiste (champ `version Int @default(0)` + retry borné) OU lock applicatif par `configId` (Redis SETNX). Faible priorité.

---

### Thème 6 — Autres (frontend UX / robustesse)

#### A9 — `defaultElementPosition()` ignore ses arguments — **Medium**
- **Symptôme** : lors d'une assignation par lot, tous les shops (sauf le 1er) se superposent en `{x:31, y:34}`.
- **Cause racine** : `StepMapShops.vue:500-502` `function defaultElementPosition() { return { x: 31, y: 34 } }` (0 paramètre), appelée `:1242` avec 2 arguments ignorés.
- **Correction** : implémenter une grille avec clamp dans les bornes de la zone :
  ```js
  function defaultElementPosition(elemCount, areaWidth, areaLength = areaWidth) {
    const step = 10, margin = 5;
    const cols = Math.max(1, Math.floor((areaWidth - margin) / step));
    const x = Math.min(margin + (elemCount % cols) * step, Math.max(0, areaWidth - 8));
    const y = Math.min(margin + Math.floor(elemCount / cols) * step, Math.max(0, areaLength - 8));
    return { x, y };
  }
  ```
  + au site d'appel passer `area.length`.

#### A11 — `skipPostCreate` → progression sans config user — **Medium**
- **Symptôme** : « Passer » ferme le dialog sans créer de config ; en étape 2, le sélecteur d'étage reste vide (dead-end), placement visuel impossible. `StepMapShops` ne sait pas créer de config par défaut.
- **Cause racine** : `StepMapSpace.vue:674-676` `skipPostCreate() { this.closePostCreate() }` ; `StepMapShops.vue` n'a aucun `createConfiguration`.
- **Correction** : création paresseuse d'une config par défaut dans `openFloorDialog` si `floorDialogConfigOptions` vide (réutiliser le payload `StepMapSpace.vue:638-659`), + filet de sécurité dans `handleSave`. Ne PAS supprimer « Passer » (optionnel par design).

#### A12 — Erreurs de mapping silencieuses (`bulkCreateAndMap`) — **Medium**
- **Symptôme** : si `bulkProductMappings` échoue pour N produits après création, l'UI affiche un faux succès « X créés et mappés » avec 0 échec.
- **Cause racine** : `StepMapMenuItems.vue:1324` `const failedCount = mappingRes?.failed || 0` lu mais jamais utilisé ; `mappingRes?.errors` ignoré (contrat backend `mappings.service.ts:599-605`). Le retour anticipé patching (`:1232-1238`) force `'done'` malgré `bulkCreateErrors > 0`.
- **Correction** : `this.bulkCreateErrors += failedCount` avant `:1328` ; marquer les lignes échouées (pattern existant `:910-924`) ; conditionner le retour anticipé sur `bulkCreateErrors`.

#### A16 — Floor nommé `'Import'` au lieu de `'RDC'` — **Low**
- **Symptôme** : le Space Builder affiche « Import » pour l'étage level 0.
- **Cause racine** : `spaces.service.ts:1943` crée le floor `name: 'Import', level: 0` ; `assignElementsToFloorLevel` retourne `floorName: 'RDC'` (recalculé `:2175`) mais ne renomme pas la ligne DB.
- **Correction** : ⚠️ `'Import'` est un **sentinel load-bearing** (`saveConfiguration:1271` matche `f.name === 'Import'`). NE PAS renommer naïvement. Préférer matcher par `level === 0` partout, OU (Option C) retourner `floor.name` réel au lieu du nom recalculé.

#### A19 — `hasMappings` / `checkMappings()` code mort — **Low**
- **Cause racine** : `useTimelineProcessing.js:190/203` exporte `hasMappings` jamais consommé ; `StepProcessTimeline.vue:825-837` `checkMappings()` jamais appelé.
- **Correction** : soit câbler une vraie bannière d'avertissement (`hasMappings === false`), soit supprimer le code/état mort.

#### A22 — `configId` non propagé aux étapes suivantes — **Low**
- **Cause racine** : `StepMapSpace.vue:620/627` n'émet que `{ spaceId }` ; `IntegrationWizard.vue:215` ignore `configId`. Atténué : config atteignable via store + dropdown manuel.
- **Correction** : stocker `created.id` et l'inclure dans le payload `handleSave`, propager `resolvedConfigId`, pré-sélectionner `floorDialogConfigId`.

#### Défauts annexes (faible valeur, à grouper)
- **`fe-stepmapshops#1` / placeElementsOnFloor sans try/catch** : Low — erreur déjà affichée + retry idempotent ; améliorer le message contextuel.
- **`fe-stepmapspace#6` / pas de check `space.id`** : Low — code mort `space.data?.id` ; consommateurs déjà gardés.
- **`fe-stepmapspace#2` / z-index dialog** : Low — ajouter `|| postCreateDialog` au `:disabled` du bouton Suivant.
- **`fe-menuitems-timeline#4` / polling figé 120 itérations** : Low — distinguer timeout du succès dans le snackbar (état resynchronisé par `loadTimeline`).
- **`fe-menuitems-timeline#7` / `itemsPerPage: 50` mort** : Low — supprimer le champ vestigial.
- **`be-openapi#3` / enum tirets vs underscores** : Low — l'enum requête (tirets) est correct ; documenter la transformation `mapElementType`, NE PAS passer aux underscores.

---

## 3. Plan de correction ORDONNÉ par phases

### P0 — Bloquant (corrige les défauts fonctionnels visibles)

| # | Anomalie | Repo | Fichiers | Dépendances | Risque régression |
|---|---|---|---|---|---|
| P0.1 | A1 — Crash `externalmerch` (Option A : rejet 400 backend + retrait appel frontend) | back + front | `spaces.service.ts:2031`, `spaces.controller.ts:791/796`, `StepMapShops.vue:301-312/1286` | — | Faible (un 500 devient 400/no-op) |
| P0.2 | A3 — `getConfiguration` renvoie `externalMerch` | back | `spaces.service.ts:1775-1787` | — | Très faible (additif, `null` rétrocompat) |
| P0.3 | A2 — Nom par défaut config user (volet frontend immédiat) | front | `StepMapSpace.vue:481/639/690`, garde `handleConfirmConfig:635` | — | Faible (défaut UX seulement) |

> P0.1 et P0.3 traitent ensemble la zone externe et la collision de nom, les deux dead-ends principaux du wizard.

### P1 — Important (robustesse, cohérence d'état)

| # | Anomalie | Repo | Fichiers | Dépendances | Risque régression |
|---|---|---|---|---|---|
| P1.1 | A6 — Migration `isSystem` + lookups par flag | back | `schema.prisma:470`, `spaces.service.ts` (3 creates + 3 lookups + selects) | — (prérequis de P1.3 frontend) | Moyen (migration + backfill, cf. §4) |
| P1.2 | A5 — Tri `getConfigurations` `asc` (+ `isSystem` si P1.1 fait) | back | `spaces.service.ts:692` | Optionnel : P1.1 | Faible (inversion d'ordre) |
| P1.3 | A2/A6 — Filtre frontend `!c.isSystem` | front | `StepMapShops.vue:607` | **Dépend de P1.1 déployé + backfill** | Moyen (si flag absent → `undefined !== true` → plus de filtre) |
| P1.4 | A4/A17/A18 — DTO de validation (assign-floor + quick-element ×2) | back | `spaces.controller.ts:778/796/1001` + nouveaux DTO | — | Moyen (`forbidNonWhitelisted` rejette champs en trop ; `ArrayNotEmpty` rejette `[]`) |

> **Dépendance critique** : P1.3 (frontend) ne doit être déployé qu'**après** P1.1 (migration + backfill backend), sinon `isSystem` arrive `undefined` et la config système réapparaît dans le sélecteur. Garder un double filtre transitoire `!c.isSystem && c.name?.toLowerCase() !== 'weezevent import'`.

### P2 — Souhaitable (qualité, contrat, UX)

| # | Anomalie | Repo | Fichiers | Dépendances | Risque régression |
|---|---|---|---|---|---|
| P2.1 | A9 — Grille `defaultElementPosition` | front | `StepMapShops.vue:500/1242` | — | Faible (purement visuel) |
| P2.2 | A11 — Création paresseuse config user | front | `StepMapShops.vue` (openFloorDialog), `StepMapSpace.vue:616` | A2 (nom neutre) | Faible (idempotence requise) |
| P2.3 | A12 — Remontée erreurs mapping | front | `StepMapMenuItems.vue:1323-1335/1232-1238` | — | Faible (vérifier condition d'avancement du wizard) |
| P2.4 | A10 — Préservation `MenuAssignment` | back | `spaces.service.ts:1318-1420` | — | Moyen (contraintes unique, durée transaction) |
| P2.5 | A7 — Supprimer doublon `quick-element` | back | `spaces.controller.ts:971-1004` | — | Faible (front utilise `/spaces`) |
| P2.6 | A13 — Corriger `@Controller` dashboard | back | `dashboard.controller.ts:25` | — | Moyen (URL réelle change → tester health/monitoring) |
| P2.7 | A8 — Régénérer `openapi.json` | back→front | `datafriday-web/openapi.json` (régénéré) | P2.5, P2.6, P1.1 (pour refléter `isSystem`) | Faible (doc) ; gros diff à relire |

### P3 — Nice-to-have (dette technique, contrat fin)

| # | Anomalie | Repo | Fichiers | Risque |
|---|---|---|---|---|
| P3.1 | A14 — Exceptions NestJS | back | `spaces.service.ts:2037/2184/1924/1896/1901` | Faible |
| P3.2 | A15 — Union discriminée réponse | back | `spaces.service.ts:2175/2310` | Faible (additif) |
| P3.3 | A16 — Label floor `'RDC'` (Option C) | back | `spaces.service.ts:2175` | Faible |
| P3.4 | A20 — `PATCH /configurations/:id` côté front | front | `configuration.api.js:68-70` | Faible (teste aussi SpaceBuilder) |
| P3.5 | A21 — Verrou optimiste sync JSON | back | `schema.prisma:470`, `spaces.service.ts:2091-2170` | Moyen (migration) |
| P3.6 | A19, A22, z-index, polling, `itemsPerPage`, enum tirets | front/back | divers | Faible |

---

## 4. Stratégie de migration Prisma pour `isSystem`

### 4.1 Schéma
```prisma
model Config {
  id        String   @id @default(cuid())
  name      String
  spaceId   String
  capacity  Int?
  data      Json?
  isSystem  Boolean  @default(false)   // NOUVEAU — true = auto-généré (import Weezevent)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // ... relations inchangées
  @@index([spaceId])
}
```
`@default(false)` rend la colonne **backfill-safe** : les lignes existantes prennent `false`.

### 4.2 Migration de données (post-`migrate`)
Les configs `'Weezevent Import'` déjà créées auront `isSystem=false` → backfill obligatoire :
```sql
-- Marquer les configs système existantes (attention à la casse exacte PascalCase backend)
UPDATE "Config" SET "isSystem" = true WHERE "name" = 'Weezevent Import';
```
⚠️ **NE PAS** toucher les configs nommées `'weezevent import'` (lowercase) : ce sont potentiellement des configs **utilisateur** (défaut du wizard avant correctif A2). Distinction a posteriori si la casse a été perdue : se baser sur la présence d'un floor `'Import'` level 0 vs floors utilisateur.

### 4.3 Dédoublonnage préalable (si index unique partiel souhaité)
Le pattern find-or-create case-sensitive a pu créer des doublons `'Weezevent Import'`. Avant tout `findFirst({ isSystem: true })` déterministe ou index unique partiel :
```sql
-- Détecter les doublons par space
SELECT "spaceId", count(*) FROM "Config" WHERE "isSystem" = true GROUP BY "spaceId" HAVING count(*) > 1;
```
Fusionner (floors/elements/mappings) puis supprimer les excédentaires AVANT :
```sql
CREATE UNIQUE INDEX "config_one_system_per_space" ON "Config" ("spaceId") WHERE "isSystem" = true;
-- (index partiel : Prisma ne le génère pas nativement → migration SQL manuelle)
```

### 4.4 Ordre de déploiement
1. `prisma migrate deploy` (colonne `isSystem`).
2. Script de backfill SQL (4.2) + dédoublonnage (4.3).
3. Déployer le backend (creates avec `isSystem:true`, lookups par flag, selects exposant `isSystem`).
4. **Seulement ensuite** déployer le frontend (`!c.isSystem`), avec double filtre transitoire conservé une release.

---

## 5. Checklist de validation

### Backend (`api-datafriday-staging`)
- [ ] **Tests unitaires service** :
  - `assignElementsToFloorLevel('externalmerch')` → `BadRequestException` (400), pas de 500, pas de config orpheline créée.
  - `assignElementsToFloorLevel([], 0)` → DTO rejette (`ArrayNotEmpty`) → 400.
  - `assignElementsToFloorLevel(..., 0)` et niveaux négatifs → toujours acceptés (non-régression RDC/sous-sols).
  - `quickCreateElement({name:''})` → 400 ; `{type:'invalid'}` → 400 (ou `'other'` selon décision) ; pas de `TypeError`.
  - `getConfiguration` retourne `externalMerch` (round-trip préserve les éléments).
  - `saveConfiguration` préserve les `MenuAssignment` après delete+recreate.
  - `getConfigurations` trie `asc` / par `isSystem` ; lookup config interne par `isSystem`.
- [ ] **Tests d'intégration** : flux wizard complet (space → config user → quick-element → assign-floor numérique/forecourt) sans 500.
- [ ] **Migration** : `prisma migrate dev` OK ; backfill SQL exécuté ; aucun doublon `isSystem=true` par space.
- [ ] **OpenAPI** : `GET /api/v1/openapi.json` contient `assign-floor`, `/spaces/{id}/quick-element`, `/spaces/{id}/shops`, `step4-context`, `PATCH /configurations/{id}` ; aucun chemin `/api/v1/api/v1/...`.
- [ ] `npm run build` + `npm run lint` (backend).

### Frontend (`datafriday-web`)
- [ ] **Manuel/E2E** :
  - Étape 1 : nom par défaut ≠ `'weezevent import'` ; impossible de créer une config nommée `'weezevent import'`.
  - Étape 2 : config utilisateur visible dans le sélecteur d'étage ; config « Weezevent Import » masquée.
  - « Passer » en étape 1 → étape 2 reste utilisable (config par défaut créée à la volée).
  - Assignation par lot → shops répartis en grille (pas de superposition).
  - Zone External Merch : soit masquée, soit message d'erreur explicite (selon décision A1).
  - `bulkCreateAndMap` avec échec simulé → état « partiel/erreur » affiché, lignes échouées marquées.
- [ ] **Régression SpaceBuilder** : sauvegarde de config via `PATCH /configurations/:id` (A20) OK hors wizard.
- [ ] Vérifier `!c.isSystem` reçoit bien le flag (sinon double filtre transitoire actif).
- [ ] `npm run build` + `npm run lint` (frontend).

### Coordination
- [ ] Déploiement backend **avant** frontend pour P1.3 (filtre `isSystem`).
- [ ] `openapi.json` régénéré et commité **après** suppression du doublon `quick-element` et correction du préfixe dashboard.
- [ ] Backfill `isSystem` exécuté **avant** bascule du frontend sur `!c.isSystem`.