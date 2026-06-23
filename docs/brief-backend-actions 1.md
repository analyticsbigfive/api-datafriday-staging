# Brief BACKEND — actions requises (2026-06-22)

Deux sujets bloquent le front. Le **#1 est urgent** (régression visible : la
persistance du réarmement échoue). Le **#2 est une feature** (réarmement sur les
ingrédients des plats composés).

Le front cible : **`VUE_APP_API_URL = https://datafriday-api.onrender.com/api/v1`**
(API hébergée sur Render). ⚠️ C'est CETTE base de données qui doit recevoir les
changements, **pas** `api-datafriday-staging`.

---

## 1. 🔴 URGENT — Table `RestockState` absente en prod (Render)

### Symptôme (logs front, authentifié)
```
PUT  /api/v1/spaces/:spaceId/restock-state  → 500
GET  /api/v1/spaces/:spaceId/restock-state  → 500
{ statusCode: 500,
  message: "Invalid `prisma.restockState.upsert()` invocation … RestockState does not exist in the current database." }
```

### Cause
La migration créant `RestockState` **n'a pas été appliquée sur la base que l'API
Render utilise**. Elle a probablement tourné sur `staging` uniquement. La table
n'existe pas dans le `DATABASE_URL` de l'API Render.

> Note : le `PUT 400 "property state should not exist"` précédent est **résolu**
> côté front (on n'envoie plus de wrapper). Le DTO est accepté ; il ne reste que
> la table manquante.

### Action
Appliquer la migration **sur la DB de l'API Render** (le `DATABASE_URL` de prod,
celui derrière `datafriday-api.onrender.com`) :
```bash
# avec le DATABASE_URL de l'API Render (PROD), pas staging
npx prisma migrate deploy
```
Puis **redéployer** le service Render si nécessaire.

### Vérification
1. `\dt` (ou Supabase table editor) → la table `RestockState` existe.
2. Contrainte `UNIQUE(tenantId, spaceId)` présente.
3. Reload de l'écran Réarmement (front) → console doit montrer :
   - `GET …/restock-state → 200` (body **null** si aucun état encore enregistré),
   - `PUT …/restock-state → 200`.

### Contrat (rappel, déjà implémenté côté front)
```
GET  /spaces/:spaceId/restock-state → 200 { id, state, updatedAt } | 200 null
PUT  /spaces/:spaceId/restock-state → 200 { id, state, updatedAt }
       body = les 9 champs À PLAT (pas de wrapper `state`)
```
Body PUT (DTO, whitelisté) :
```ts
{
  objectiveSource: string,                 // 'sales' | 'forecast'
  referenceEventId: string | null,
  selectedEventIds: string[],
  stockAdjustments: Record<string, number>,
  stockPackedModes: Record<string, unknown>,
  restockedRows: Record<string, unknown>,
  restockGenerated: boolean,
  shoppingGenerated: boolean,
  restockViewMode: string,                 // 'shop' | 'item'
}
```
Le backend stocke ce blob dans la colonne jsonb `state` et renvoie `{ id, state,
updatedAt }`. Le front ne lit que `state`.

### (Optionnel) Étendre le DTO à 2 champs
Le front gère désormais 2 champs de plus, **retirés du PUT** pour ne pas casser
le DTO actuel (`forbidNonWhitelisted`). Ils restent donc en localStorage
(non cross-machine) :
```ts
stockExcluded: Record<string, boolean>,   // items décochés dans « Éléments à stocker »
currentStep: number,                       // étape du wizard (1|2|3)
```
👉 Si on les veut **cross-machine**, les ajouter au DTO + à la colonne `state`.
Sinon, ne rien faire (acceptable).

---

## 2. 🟠 FEATURE — Recettes des menu items non exposées (plats composés)

### Besoin
Le réarmement doit se faire sur les **composants** d'un plat (ex.
`SANDWICH AMERICAIN AVEC FRITES` → pain, steak, frites…), pas sur le plat
lui-même. Aujourd'hui il affiche le plat avec « Undefined supplier » car on ne
connaît pas sa composition.

### Constat (diagnostic front, données réelles space Auxerre)
- `GET /menu-items` → **tous les 66 items ont `componentsCount: 0`**, `components: []`,
  `readyForSale: null`, `comboItem: null`. → **aucune recette inline**.
- `GET /menu-components` → **3 lignes** seulement (sous-recettes type « Jus Pickle »),
  et leur champ **`parents` est VIDE `[]`** → aucun lien vers un menu item.
- Donc **le lien plat → ingrédients n'existe nulle part dans l'API**.

### Ce qu'il faut exposer (1 des 3 options)
Le moteur front sait déjà décomposer un plat en ingrédients **dès que la recette
est disponible** (`expandMenuItemStock` : `qté = numberOfUnits × qtéPlat /
numberOfPiecesRecipe`, récursif). Il faut donc exposer la recette, au choix :

1. **Inline sur `/menu-items`** (préféré) — chaque menu item porte `components[]` :
   ```ts
   menuItem.components = [
     {
       id, sourceId, name,                 // l'ingrédient/composant
       itemType: 'Ingredient' | 'Component',
       numberOfUnits: number,              // quantité par recette
       unit: string,
       category, marketPriceId, ...        // pour coût/fournisseur
     }, ...
   ]
   // + readyForSale ('Yes'|'No') et numberOfPiecesRecipe sur le menu item
   ```
2. **Peupler `parents` sur `/menu-components`** : chaque composant liste les menu
   items qui l'utilisent (+ quantité par recette). Le front fera le join.
3. **Nouvel endpoint** `GET /menu-items/:id/recipe` renvoyant la liste ci-dessus.

### Données déjà présentes (réutilisables)
La structure existe au niveau composant : un `/menu-components` a déjà
`ingredients[]` avec `quantity`, `unit`, `cost`, et `ingredient.marketPriceId`
(donc coût + fournisseur récupérables). Il **manque uniquement le lien
menu item → composants/ingrédients** (et `readyForSale`/`numberOfPiecesRecipe`
sur le menu item).

### Impact
Tant que non exposé : réarmement sur le plat (faux), pas de fournisseur, pas de
marge correcte. Une fois exposé : ~5 min côté front pour brancher le join → le
réarmement liste pain/steak/frites avec quantités + fournisseurs.

---

## Récap priorités

| # | Sujet | Action | Bloquant |
|---|---|---|---|
| 1 | `RestockState` manquante (Render) | `prisma migrate deploy` sur la DB Render prod | 🔴 oui |
| 1b | DTO restock (optionnel) | + `stockExcluded`, `currentStep` | 🟢 non |
| 2 | Recettes menu items | exposer la composition (1 des 3 options) | 🟠 feature |

Après #1 : reload front → `GET`/`PUT restock-state` doivent passer **200**.
