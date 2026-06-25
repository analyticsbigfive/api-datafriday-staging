# Backend — ajouter `manualQuantities` à EventPredictVersion

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
