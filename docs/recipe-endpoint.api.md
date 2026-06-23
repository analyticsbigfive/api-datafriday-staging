# Contrat API — `GET /menu-items/:id/recipe` (+ batch)

Endpoint **dédié** (ne touche PAS au `components` existant de `/menu-items` =
`MenuItemComponent[]` → pas de régression éditeur recettes / `/space-menus` / DTO
create-update / Swagger).

Objectif : croiser **fournisseurs × menu items** pour le réarmement des plats
composés. Le moteur front (`expandMenuItemStock`, `inventoryUtils`,
`SpaceRestockView`) est déjà branché ; il manque la donnée + le lien fournisseur.

---

## 1. Single — `GET /menu-items/:id/recipe`

### Request

```
GET /menu-items/:id/recipe
Authorization: Bearer <token>
```

Pas de body.

### Response 200 — `readyForSale = "No"` (plat composé, sandwich + serviette)

```json
{
  "id": "mi_sandwich_americain",
  "name": "Sandwich américain avec frites",
  "readyForSale": "No",
  "comboItem": "No",
  "numberOfPiecesRecipe": 1,
  "cost": 2.10,
  "components": [
    {
      "id": "c_1",
      "sourceId": "ing_pain",
      "name": "Pain",
      "itemType": "Ingredient",
      "numberOfUnits": 1,
      "unit": "pcs",
      "category": "food",
      "storageType": "food",
      "marketPriceId": "mp_pain_01",
      "supplierId": "sup_boulangerie",
      "cost": 0.30
    },
    {
      "id": "c_2",
      "sourceId": "ing_steak",
      "name": "Steak haché",
      "itemType": "Ingredient",
      "numberOfUnits": 1,
      "unit": "pcs",
      "category": "food",
      "storageType": "food",
      "marketPriceId": "mp_steak_01",
      "supplierId": "sup_boucher",
      "cost": 1.10
    },
    {
      "id": "c_3",
      "sourceId": "ing_frites",
      "name": "Frites",
      "itemType": "Ingredient",
      "numberOfUnits": 150,
      "unit": "g",
      "category": "food",
      "storageType": "food",
      "marketPriceId": "mp_frites_01",
      "supplierId": "sup_grossiste",
      "cost": 0.40
    },
    {
      "id": "c_4",
      "sourceId": "pkg_serviette",
      "name": "Serviette",
      "itemType": "Packaging",
      "numberOfUnits": 1,
      "unit": "pcs",
      "category": "packaging",
      "storageType": "material",
      "marketPriceId": "mp_serviette_01",
      "supplierId": "sup_grossiste",
      "cost": 0.02
    }
  ],
  "suppliers": [
    { "id": "sup_boulangerie", "name": "Boulangerie Centrale", "email": "cmd@boulangerie.fr", "phone": "+33100000001", "sites": ["space_auxerre"] },
    { "id": "sup_boucher",      "name": "Boucherie Martin",     "email": "cmd@martin.fr",      "phone": "+33100000002", "sites": ["space_auxerre"] },
    { "id": "sup_grossiste",    "name": "Metro Pro",            "email": "cmd@metro.fr",       "phone": "+33100000003", "sites": ["space_auxerre", "space_paris"] }
  ]
}
```

### Response 200 — `readyForSale = "Yes"` (vendu tel quel, pas de fournisseur de recette)

```json
{
  "id": "mi_water_50cl",
  "name": "Bouteille d'eau 50cl",
  "readyForSale": "Yes",
  "comboItem": "No",
  "numberOfPiecesRecipe": 1,
  "cost": 0.35,
  "components": [],
  "suppliers": []
}
```

---

## 2. Batch (recommandé) — `POST /menu-items/recipes`

Le réarmement charge **tous** les items d'un space (Auxerre = 66) → éviter 66
appels. Même shape par item.

### Request

```json
{ "ids": ["mi_sandwich_americain", "mi_water_50cl", "..."] }
```

(Variante acceptable : `GET /menu-items/recipes?spaceId=:id` qui renvoie toute la
carte du space.)

### Response 200

```json
{
  "items": [ /* objets identiques au §1, un par menu item */ ],
  "suppliers": [ /* dictionnaire fournisseurs dédupliqué pour tout le batch */ ]
}
```

> Au choix : `suppliers` global au niveau batch (dédup) OU par item. Le front
> dédup de toute façon par `supplier.id`.

---

## 3. Champs — origine backend → conscommateur front

| Champ | Type | Oblig. | Source backend | Consommé par |
|---|---|---|---|---|
| `id` | string | ✅ | MenuItem.id | racine `expandMenuItemStock` |
| `name` | string | ✅ | MenuItem.name | affichage |
| `readyForSale` | `"Yes"`\|`"No"` (jamais `null`) | ✅ | règle métier (voir bas) | aiguillage : `Yes`=tel quel, `No`=éclate `components[]` |
| `comboItem` | `"Yes"`\|`"No"` | ✅ | MenuItem.comboItem | flag combo |
| `numberOfPiecesRecipe` | number ≥ 1 | ✅ | MenuItem (défaut 1) | dénominateur scaling : `qté = numberOfUnits × qtéPlat / numberOfPiecesRecipe` |
| `cost` | number | ⬜ | MenuItem.cost | marge |
| `components[]` | array | ✅ | fusion `MenuItemIngredient` + `MenuItemComponent` + `MenuItemPackaging` | éclatement recette |
| `components[].id` | string | ✅ | id de la ligne | id ligne |
| `components[].sourceId` | string | ✅ | ingredientId / componentId / packagingId | match récursif + clé |
| `components[].name` | string | ✅ | nom élément | affichage |
| `components[].itemType` | `"Ingredient"`\|`"Component"`\|`"Packaging"` | ✅ | type ligne | typage |
| `components[].numberOfUnits` | number | ✅ | quantité recette | numérateur scaling |
| `components[].unit` | string | ✅ | `g`/`ml`/`pcs`/`unit` | unité |
| `components[].category` | string | ✅ | doit contenir `packaging`/`emballage` si packaging | détection packaging |
| `components[].storageType` | string | ✅ | `material` si packaging, sinon `food`/`drink` | détection packaging |
| `components[].marketPriceId` | string | ✅* | MenuItemIngredient.marketPriceId | pont vers prix/fournisseur |
| `components[].supplierId` | string | ✅* | **résolu** `marketPrice.supplier_id` | **fournisseur** (fallback #1 front) |
| `components[].cost` | number | ⬜ | coût unitaire | marge |
| `suppliers[]` | array | ✅* | Supplier joint | dictionnaire `suppliers.find(s => s.id === supplierId)` |
| `suppliers[].id` | string | ✅* | Supplier.id | clé groupement |
| `suppliers[].name` | string | ✅* | Supplier.name | en-tête liste courses (sinon "Undefined supplier") |
| `suppliers[].email` | string | ⬜ | Supplier.email | envoi commande |
| `suppliers[].phone` | string | ⬜ | Supplier.phone | contact |
| `suppliers[].sites` | string[] | ⬜ | Supplier.sites/spaces | valider que fournisseur dessert le space |

`*` = requis pour la feature fournisseur. Sans `supplierId` + `suppliers[]`
peuplés → le front affiche **"Undefined supplier"** partout.

---

## 4. Résolution fournisseur côté front (déjà codée)

```
component.supplierId
  || component.supplier?.id
  || component.supplier
  || '__unknown_supplier__'
→ suppliers.find(s => s.id === supplierId)
→ supplier.name | supplier.email | supplier.phone   (groupement liste de courses)
```

⚠️ **Backend doit pré-résoudre** `marketPrice.supplier_id → supplierId` sur
chaque component. Si tu envoies seulement `marketPriceId` sans `supplierId`, le
front ne peut pas joindre (il n'a pas la table marketPrice → supplier).
Alternative : renvoyer aussi un dictionnaire `marketPrices: [{ id, supplier_id, supplierItem }]`
et le front fera le join — mais `supplierId` inline est plus simple.

---

## 5. Règle métier `readyForSale`

| Valeur | Sens | Réarmement |
|---|---|---|
| `"Yes"` | Livré prêt au PDV, déjà emballé (chips, bouteilles, certains sandwichs) | réarme le Menu Item tel quel, packaging non séparé |
| `"No"` | Assemblage / ajout au PDV (sandwich + serviette) | éclate `components[]` (ingrédients + packaging) |

`readyForSale` doit valoir `Yes`/`No`, **jamais `null`** (aujourd'hui tous `null`).

---

## 6. Récursion plats composés (combo)

Si un `component` est lui-même un menu item composé (`itemType="Component"` qui
pointe vers un autre MenuItem `readyForSale="No"`), 2 options :

- **A (recommandé)** : backend **aplatit** côté serveur → `components[]` ne
  contient que des éléments terminaux (ingrédients + packaging), `numberOfUnits`
  déjà absolus pour 1 plat, `numberOfPiecesRecipe=1`. Front consomme direct.
- **B** : renvoyer la sous-recette imbriquée et exposer aussi les sous-items dans
  le batch → `expandMenuItemStock` recurse (MAX_DEPTH 10) via `sourceId`/`name`.

A = moins d'aller-retours, recommandé.

---

## Checklist d'acceptation

- [ ] `readyForSale` ∈ {`Yes`,`No`} sur chaque item (jamais `null`).
- [ ] `numberOfPiecesRecipe` ≥ 1.
- [ ] `components[]` peuplé pour `readyForSale="No"`.
- [ ] packaging **dans** `components[]`, `category`=`packaging`/`emballage` + `storageType`=`material`.
- [ ] `components[].supplierId` résolu (pas seulement `marketPriceId`).
- [ ] `suppliers[]` (id + name min.) présent et couvre tous les `supplierId` référencés.
- [ ] Batch dispo pour charger tout un space en 1 appel.
