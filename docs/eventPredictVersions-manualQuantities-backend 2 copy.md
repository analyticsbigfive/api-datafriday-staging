# Backend — ajouter `manualQuantities` + `predictedRecords` à EventPredictVersion

> **2 colonnes JSON à ajouter** sur `EventPredictVersion`. Les deux peuvent partir
> dans **une seule migration**. Section A = `manualQuantities` (quantités manuelles
> items prédit-0). Section B = `predictedRecords` (quantités prédites par item,
> requises par le **réarmement** cross-device). Mise à jour 2026-06-25.
>
> Différence importante côté front :
> - `manualQuantities` : le front NE l'envoie PAS encore (ligne commentée) — à
>   dé-commenter après déploiement.
> - `predictedRecords` : le front l'envoie **déjà**, avec un **strip-and-retry sur
>   400** (si la colonne/DTO n'existe pas, il retire la clé et rejoue → le save ne
>   casse jamais). Dès que le backend whitelist la clé, la persistance s'active
>   **sans changement front**.

---

# A. `manualQuantities`

## Contexte

L'onglet **Configuration** d'EventPredict permet d'ajuster les quantités par
(shop × item). Pour les items dont la **prédiction = 0**, le pourcentage est
inopérant (`0 × % = 0`) : le front utilise désormais une **quantité absolue**
saisie via un slider, stockée dans une map `manualQuantities`.

Cette map est aujourd'hui persistée **uniquement** en `localStorage` (draft +
version locale). Elle n'est **pas** sauvegardée dans la table `EventPredictVersion`
car la colonne n'existe pas. Résultat : une quantité 0-vente saisie est **perdue**
au rechargement d'une version depuis la BDD.

Vérifié le 2026-06-25 : le DTO POST `/events/:id/predict-versions` est en
`forbidNonWhitelisted` → envoyer `manualQuantities` aujourd'hui renvoie
`400 "property manualQuantities should not exist"` et **casse tous les saves**.
Le front ne l'envoie donc PAS tant que le backend ne l'accepte pas.

## Forme de la donnée

```ts
manualQuantities: Record<string, number>
// clé = `${elementId}-${menuItemId}`  (ex: "cmpzfqw8z012n7sis0vress27-267f4468-…")
// valeur = unités absolues (entier ≥ 0)
// défaut = {}
```

Même nature que `quantityAdjustments` (déjà en base) — JSON, défaut `{}`.

## Changements backend (NestJS + Prisma)

### 1. Prisma schema — modèle `EventPredictVersion`
```prisma
model EventPredictVersion {
  // … champs existants (menuConfig, quantityAdjustments, …)
  quantityAdjustments Json @default("{}")
  manualQuantities    Json @default("{}")   // <-- AJOUTER
  // …
}
```

### 2. Migration
```bash
npx prisma migrate dev --name add_manual_quantities_to_predict_version
# (ou en prod : npx prisma migrate deploy)
```
SQL équivalent :
```sql
ALTER TABLE "EventPredictVersion"
  ADD COLUMN "manualQuantities" JSONB NOT NULL DEFAULT '{}'::jsonb;
```

### 3. DTO — `CreateEventPredictVersionDto` **et** `UpdateEventPredictVersionDto`
```ts
@IsOptional()
@IsObject()
manualQuantities?: Record<string, number>;
```
(Indispensable : sans whitelist du champ, `forbidNonWhitelisted` continuera de
renvoyer 400.)

### 4. Service create/update
Inclure le champ dans le `data` Prisma :
```ts
data: {
  // …
  quantityAdjustments: dto.quantityAdjustments ?? {},
  manualQuantities: dto.manualQuantities ?? {},   // <-- AJOUTER
}
```
La réponse renvoie déjà la ligne complète → `manualQuantities` sera dans le GET
(le front le lit déjà via `dbToVersion`).

## Changement front (à faire APRÈS le déploiement backend)

Dans `src/composables/useEventPredictVersions.js`, fonction `versionToPayload`,
**dé-commenter** :
```js
manualQuantities: v.manualQuantities || {},
```
(Le mapping lecture `dbToVersion` + la conservation localStorage sont déjà en
place ; seul l'envoi POST/PATCH est gardé en attendant cette colonne.)

## Vérification end-to-end (après les 2 côtés)
1. Event réel → onglet Configuration → shop **open** → item à prédit 0 → slider
   quantité monte (ex. 30).
2. **Save** une version.
3. `GET /events/:id/predict-versions` → la version renvoie
   `manualQuantities: { "<elementId>-<menuItemId>": 30 }`.
4. Recharger la page → charger la version → le slider 0-vente réaffiche 30
   (et le CA / Stock-up en tiennent compte).

---

# B. `predictedRecords` (réarmement)

## Contexte

L'étape **Stock** du réarmement (`/spaces/:id/restock?...&step=stock`) a besoin des
**quantités prédites par item** (shop × menuItem). Aujourd'hui la version DB
`EventPredictVersion` ne stocke **que** les % (`quantityAdjustments`) et les events
sources (`selectedPredictionEventIds`) — **pas** les quantités par item.

Ces quantités vivent donc **uniquement en `localStorage`** (pont EventPredict →
réarmement). Conséquence : ouvert sur **un autre navigateur / device / session**,
ou après vidage du cache, le réarmement n'a **aucune** source de quantité par item
(la reconstruction de secours s'appuie sur des données **shop-level**, sans
`menuItemId` → 0). Persister ces records en BDD rend le réarmement **indépendant du
localStorage**.

## Forme de la donnée

```ts
predictedRecords: Array<{
  shopId: string;
  shop: string | null;
  menuItemId: string;
  mappedMenuItemId: string | null;
  itemName: string | null;
  totalQuantity: number;   // unités prédites (somme sur la timeline)
  totalRevenue: number;    // CA prédit correspondant
}>
// défaut = []
```

Agrégat compact (1 entrée par `shopId|menuItemId`). Tableau JSON, défaut `[]`.

## Changements backend (NestJS + Prisma)

### 1. Prisma schema — modèle `EventPredictVersion`
```prisma
model EventPredictVersion {
  // … champs existants
  quantityAdjustments Json @default("{}")
  manualQuantities    Json @default("{}")   // section A
  predictedRecords    Json @default("[]")   // <-- AJOUTER (défaut tableau)
  // …
}
```

### 2. Migration (peut être fusionnée avec celle de la section A)
```bash
npx prisma migrate dev --name add_predicted_records_to_predict_version
# (ou en prod : npx prisma migrate deploy)
```
SQL équivalent :
```sql
ALTER TABLE "EventPredictVersion"
  ADD COLUMN "predictedRecords" JSONB NOT NULL DEFAULT '[]'::jsonb;
```

### 3. DTO — `CreateEventPredictVersionDto` **et** `UpdateEventPredictVersionDto`
```ts
@IsOptional()
@IsArray()
predictedRecords?: Array<Record<string, unknown>>;
```
(Indispensable : sans whitelist, `forbidNonWhitelisted` renvoie 400 et le front
retombe sur son strip-retry → la colonne reste vide.)

### 4. Service create/update
```ts
data: {
  // …
  quantityAdjustments: dto.quantityAdjustments ?? {},
  manualQuantities: dto.manualQuantities ?? {},        // section A
  predictedRecords: dto.predictedRecords ?? [],        // <-- AJOUTER
}
```
La réponse renvoie la ligne complète → `predictedRecords` sera dans le GET (le front
le lit déjà via `dbToVersion` côté EventPredict **et** `mapBddVersion` côté
réarmement).

> ⚠️ Le front n'envoie `predictedRecords` que s'il est **non-vide** (un PATCH update
> sans la clé ne doit donc **pas** réinitialiser la colonne à `[]`). Garder la
> sémantique « champ absent du DTO → on ne touche pas à la colonne » sur l'update.

## Changement front — ✅ DÉJÀ FAIT

Aucune action front requise après déploiement. Déjà en place :
- `EventPredictView.vue` : `buildPredictedRecords()` + `snapshotForVersion.predictedRecords`.
- `useEventPredictVersions.js` : `versionToPayload`/`dbToVersion` portent la clé ;
  POST/PATCH résilients (`postVersion`/`patchVersion`, strip-retry sur 400).
- `SpaceRestockView.vue` : `mapBddVersion` lit `predictedRecords` ; ordre de
  résolution = pont localStorage → `version.predictedRecords` (BDD) → reconstruction.

## Vérification end-to-end (après déploiement backend)
1. Vider le `localStorage` du navigateur (simule un autre device).
2. EventPredict sur un event réel → attendre le calcul de la timeline → **Save** une version.
3. `POST /events/:id/predict-versions` (onglet Réseau) → le payload contient
   `predictedRecords: [{ shopId, menuItemId, totalQuantity, … }]` (plus de 400).
4. `GET /events/:id/predict-versions` → la version renvoie le même `predictedRecords`.
5. Ouvrir `/spaces/:id/restock?event=<id>&step=stock` **dans un autre navigateur**
   (sans localStorage) → les quantités par item s'affichent (lues depuis
   `version.predictedRecords`, pas de bandeau d'avertissement).
