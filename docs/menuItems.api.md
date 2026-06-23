# Contrat API `/menu-items` — réarmement des plats composés

## Pourquoi

Le **réarmement** (restock), l'**inventaire** et le calcul de **disponibilité** des
plats reposent sur 3 informations par menu item. Aujourd'hui elles **ne sont pas
exposées** par l'API : `readyForSale = null`, `components = []`
(`componentsCount = 0`), `/menu-components` renvoie `parents = []`.

Conséquence : le front **ne peut pas éclater** un plat composé en ses ingrédients/
composants/packaging. La logique de décomposition est **déjà codée**
(`src/utils/stockPlanning.js → expandMenuItemStock`, `src/utils/inventoryUtils.js`),
seul le **data/contrat API** manque.

## Ce qu'il faut exposer

Sur **`GET /menu-items`** (liste paginée) **et** `GET /menu-items/:id`, chaque menu
item doit porter :

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | string | ✅ | Identifiant |
| `name` | string | ✅ | Nom |
| `readyForSale` | `"Yes"` \| `"No"` | ✅ | Voir règle métier ci-dessous |
| `comboItem` | `"Yes"` \| `"No"` | ✅ | Plat combo (menu) |
| `numberOfPiecesRecipe` | number | ✅ | Nombre de pièces produites par la recette (défaut 1) |
| `cost` | number | ⬜ | Coût unitaire (déjà utilisé pour la marge) |
| `components` | `Component[]` | ✅ | **Fusion** ingrédients + composants + **packaging** (voir ci-dessous) |

### Shape `Component[]`

`components` est la **dénormalisation** des 3 relations
`MenuItemIngredient` + `MenuItemComponent` + `MenuItemPackaging` en **un seul
tableau**. Chaque entrée :

| Champ | Type | Description |
|---|---|---|
| `id` | string | Id de la ligne |
| `sourceId` | string | Id de l'entité liée (ingredientId / componentId / packagingId) |
| `name` | string | Nom de l'ingrédient/composant/packaging |
| `itemType` | `"Ingredient"` \| `"Component"` \| `"Packaging"` | Type de la ligne |
| `numberOfUnits` | number | Quantité par recette (pour `numberOfPiecesRecipe` pièces) |
| `unit` | string | Unité (`g`, `ml`, `pcs`, `unit`…) |
| `category` | string | **Doit contenir `packaging` ou `emballage`** pour un packaging |
| `storageType` | string | **`material`** pour un packaging (sinon `food`/`drink`…) |

> ⚠️ **Le packaging DOIT être DANS `components[]`**, pas dans un champ séparé. Le
> front détecte le packaging via `category` (`packaging`/`emballage`),
> `storageType === 'material'`, ou `sourceId` préfixé `pkg-`
> (`src/utils/stockPlanning.js → isPackagingComponent`).

## Règle métier `readyForSale`

| Valeur | Sens | Réarmement |
|---|---|---|
| `"Yes"` | Article livré **prêt** au PDV, déjà emballé depuis la cuisine centrale (chips, paquets de bonbons, bouteilles d'eau, certains sandwichs) | On réarme le **Menu Item tel quel**. Packaging **non** séparé — rien à ajouter au PDV. |
| `"No"` | Assemblage / ajout **au PDV** (ex. sandwich fait en cuisine centrale + **serviette** ajoutée sur place) | On **éclate** `components[]` (composant sandwich + packaging serviette, etc.). |

C'est la fiche technique qui fait foi : si un packaging est ajouté au PDV,
l'article est modélisé en `readyForSale = "No"` avec un composant packaging dédié.

## Exemples

### `readyForSale = "Yes"` — bouteille d'eau (vendue telle quelle)

```json
{
  "id": "mi_water_50cl",
  "name": "Bouteille d'eau 50cl",
  "readyForSale": "Yes",
  "comboItem": "No",
  "numberOfPiecesRecipe": 1,
  "cost": 0.35,
  "components": []
}
```

### `readyForSale = "No"` — sandwich + serviette ajoutée au PDV

```json
{
  "id": "mi_sandwich_americain",
  "name": "Sandwich américain",
  "readyForSale": "No",
  "comboItem": "No",
  "numberOfPiecesRecipe": 1,
  "cost": 2.10,
  "components": [
    {
      "id": "c_1",
      "sourceId": "ing_sandwich_americain",
      "name": "Sandwich américain (cuisine centrale)",
      "itemType": "Component",
      "numberOfUnits": 1,
      "unit": "pcs",
      "category": "food",
      "storageType": "food"
    },
    {
      "id": "c_2",
      "sourceId": "pkg_serviette",
      "name": "Serviette",
      "itemType": "Packaging",
      "numberOfUnits": 1,
      "unit": "pcs",
      "category": "packaging",
      "storageType": "material"
    }
  ]
}
```

## Tolérance côté front (déjà en place)

Le front normalise les menu items à la réception
(`src/utils/menuItemNormalize.js`, branché dans `useSpaceData`) :

- `readyForSale` accepté en `true/false`, `"yes"/"no"`, `"oui"/"non"`, `"1"/"0"`
  → normalisé en `"Yes"/"No"`.
- `components` lu depuis `components`, sinon `componentsData` (JSON string OK),
  sinon fusion de `ingredients` + `componentsList` + `packagings`.
- Noms de champs alternatifs tolérés : `quantity`/`qty`→`numberOfUnits`,
  `itemName`→`name`, `ingredientId`/`componentId`/`packagingId`→`sourceId`.

→ **Idéalement le backend renvoie directement la shape ci-dessus.** La tolérance
n'est qu'un filet de sécurité ; elle ne crée pas la donnée manquante
(`readyForSale` et les recettes doivent exister en base).

## Checklist d'acceptation

- [ ] `GET /menu-items` renvoie `readyForSale` ∈ {`Yes`,`No`} (non `null`) sur chaque item.
- [ ] `numberOfPiecesRecipe` présent (≥ 1).
- [ ] `components[]` peuplé pour les plats composés (`readyForSale = No`).
- [ ] Le **packaging** apparaît **dans** `components[]` avec `category`/`storageType` détectables.
- [ ] `comboItem` présent.
- [ ] Mêmes champs sur `GET /menu-items/:id`.

## En attendant le backend

Le front remplit `readyForSale` + recettes via l'import CSV
(bouton **« Importer recettes »** dans Menu Items →
`src/components/menu-fb/views/menu-items/drawers/RecipeImportDrawer.vue`,
fichier `recettes-a-completer.csv`). Cela écrit `MenuItemIngredient` +
`readyForSale`, mais le **packaging** et les **composants menu-item** restent à
exposer côté API.
