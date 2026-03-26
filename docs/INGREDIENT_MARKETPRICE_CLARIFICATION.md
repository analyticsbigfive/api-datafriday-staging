# Clarification : Ingredients vs MarketPrices vs Components

## Vue d'ensemble

Ce document clarifie la distinction entre les trois entités principales du système de gestion des ingrédients et des prix.

---

## Architecture des données

### 1. **MarketPrice** (Table `market_price`)

**Rôle** : Catalogue des produits disponibles chez les fournisseurs avec leurs prix.

**Caractéristiques** :
- Représente un produit spécifique d'un fournisseur
- Contient le prix d'achat, l'unité, le type de produit (Food/Beverage/Packaging/Other)
- Peut avoir plusieurs entrées pour le même produit (différents fournisseurs)
- **N'est PAS directement utilisable dans les recettes**

**Champs clés** :
```typescript
{
  id: string
  itemName: string          // Ex: "Farine de blé T55"
  unit: string              // Ex: "kg"
  price: Decimal            // Ex: 25.00
  goodType: GoodType        // Food | Beverage | Packaging | Other
  supplierId?: string
  supplier?: string
  recipeUnit?: string
  purchaseUnitConversion?: number
}
```

**Créé depuis** : `MarketPricesView` (frontend) → `POST /market-prices`

---

### 2. **Ingredient** (Table `ingredient`)

**Rôle** : Ingrédient utilisable dans les recettes et composants.

**Caractéristiques** :
- Représente un ingrédient de recette
- **Référence optionnellement** un `MarketPrice` via `marketPriceId`
- Contient les informations de coût calculées pour les recettes
- **C'est cette entité qui est utilisée dans les composants**

**Champs clés** :
```typescript
{
  id: string
  name: string                        // Ex: "Farine"
  recipeUnit: string                  // REQUIS - Ex: "kg"
  purchaseUnit: string                // REQUIS - Ex: "sac"
  marketPriceId?: string              // Lien vers MarketPrice
  costPerRecipeUnit?: Decimal         // Coût par kg
  costPerPurchaseUnit?: Decimal       // Coût par sac
  purchaseUnitsPerRecipeUnit?: number // Conversion
  active: boolean
}
```

**Créé depuis** :
1. `IngredientsView` (frontend) → `POST /ingredients`
2. **Auto-créé** lors de la création d'un `MarketPrice` (Food/Beverage)

---

### 3. **ComponentIngredient** (Table `component_ingredient`)

**Rôle** : Table de jointure entre `MenuComponent` et `Ingredient`.

**Caractéristiques** :
- Lie un composant à ses ingrédients
- **Attend un `ingredientId`**, PAS un `marketPriceId`
- Stocke la quantité et le coût pour cet ingrédient dans ce composant

**Champs clés** :
```typescript
{
  id: string
  componentId: string    // FK → MenuComponent
  ingredientId: string   // FK → Ingredient (PAS MarketPrice!)
  quantity: number
  unit?: string
  cost?: Decimal
}
```

---

## Flux de données

### Scénario 1 : Création d'un produit fournisseur (MarketPrice)

```
1. User crée un MarketPrice via MarketPricesView
   ↓
2. POST /market-prices
   ↓
3. MarketPricesService.create()
   ↓
4. Création de l'entrée MarketPrice
   ↓
5. SI goodType === 'Food' OU 'Beverage'
   → Auto-création d'un Ingredient lié (marketPriceId)
   ↓
6. L'Ingredient est maintenant disponible pour les composants
```

### Scénario 2 : Ajout d'un ingrédient à un composant

```
1. User édite un MenuComponent
   ↓
2. Sélectionne un ingrédient (depuis la table Ingredient)
   ↓
3. PUT /menu-components/:id/ingredients
   ↓
4. MenuComponentsService.replaceIngredients()
   ↓
5. Validation : assertIngredientsExist()
   → Vérifie que les IDs existent dans la table Ingredient
   ↓
6. Création des entrées ComponentIngredient
```

---

## Problème résolu

### Avant (comportement problématique)

1. User crée un "produit" dans MarketPrices
2. Le produit est créé dans `market_price` uniquement
3. User essaie d'ajouter ce "produit" à un composant
4. **Erreur 400** : "Invalid ingredientId" car l'ID n'existe pas dans `ingredient`

### Après (comportement corrigé)

1. User crée un "produit" dans MarketPrices (Food/Beverage)
2. Le produit est créé dans `market_price`
3. **Un `Ingredient` correspondant est auto-créé** avec `marketPriceId` lié
4. User peut maintenant ajouter cet ingrédient à un composant ✅

---

## Endpoints API

### 1. Auto-synchronisation (pour les données existantes)

```http
POST /api/v1/market-prices/sync-ingredients
```

**Fonction** : Crée automatiquement les `Ingredient` manquants pour tous les `MarketPrice` existants (Food/Beverage).

**Réponse** :
```json
{
  "created": 42,
  "skipped": 15,
  "total": 57
}
```

**Utilisation** :
- À exécuter une fois après le déploiement pour synchroniser les données existantes
- Accessible depuis le frontend via `menuStore.syncMarketPriceIngredients()`

---

### 2. Récupérer les ingrédients d'un MarketPrice spécifique

```http
GET /api/v1/ingredients/by-market-price/:marketPriceId
```

**Fonction** : Récupère tous les `Ingredient` liés à un `MarketPrice` spécifique.

**Paramètres** :
- `marketPriceId` (path, required) : ID du MarketPrice

**Réponse** :
```json
[
  {
    "id": "ing_123",
    "name": "Oignon blanc",
    "recipeUnit": "kg",
    "purchaseUnit": "kg",
    "supplier": "Metro",
    "marketPriceId": "mp_456",
    "costPerRecipeUnit": 90.00,
    "costPerPurchaseUnit": 90.00,
    "purchaseUnitsPerRecipeUnit": 1,
    "active": true,
    "marketPrice": {
      "id": "mp_456",
      "itemName": "Oignon",
      "unit": "kg",
      "price": 90.00,
      "goodType": "Food",
      "category": "Vegetable",
      "supplier": "Metro"
    }
  }
]
```

**Utilisation frontend** :
```javascript
import { getIngredientsByMarketPriceId } from '@/api'

const ingredients = await getIngredientsByMarketPriceId('mp_456')
```

---

### 3. Récupérer tous les MarketPrices avec leurs ingrédients

```http
GET /api/v1/market-prices/with-ingredients
```

**Fonction** : Récupère tous les `MarketPrice` avec leurs `Ingredient` associés, avec pagination, recherche et filtres.

**Query Parameters** :
- `page` (number, optional) : Numéro de page (défaut: 1)
- `limit` (number, optional) : Nombre d'éléments par page (défaut: 100)
- `search` (string, optional) : Recherche par nom, catégorie ou fournisseur
- `scope` (enum, optional) : Portée des données
  - `tenant` : Uniquement les MarketPrices du client
  - `global` : Uniquement les MarketPrices globaux
  - `all` : Les deux (défaut)
- `goodType` (string, optional) : Type de produit (`Food`, `Beverage`, `Packaging`, `Other`)

**Exemples de requêtes** :
```http
# Page 1, 50 éléments
GET /api/v1/market-prices/with-ingredients?page=1&limit=50

# Recherche "oignon" dans les produits du client
GET /api/v1/market-prices/with-ingredients?search=oignon&scope=tenant

# Uniquement les produits Food
GET /api/v1/market-prices/with-ingredients?goodType=Food

# Recherche "Metro" dans tous les produits (client + global)
GET /api/v1/market-prices/with-ingredients?search=Metro&scope=all
```

**Réponse** :
```json
{
  "data": [
    {
      "id": "mp_123",
      "itemName": "Oignon",
      "unit": "kg",
      "price": 90.00,
      "goodType": "Food",
      "category": "Vegetable",
      "supplier": "Metro",
      "supplierId": "sup_789",
      "tenantId": "tenant_456",
      "supplierRel": {
        "id": "sup_789",
        "name": "Metro"
      },
      "ingredients": [
        {
          "id": "ing_001",
          "name": "Oignon blanc",
          "recipeUnit": "kg",
          "purchaseUnit": "kg",
          "marketPriceId": "mp_123",
          "costPerRecipeUnit": 90.00
        },
        {
          "id": "ing_002",
          "name": "Oignon rouge",
          "recipeUnit": "kg",
          "purchaseUnit": "kg",
          "marketPriceId": "mp_123",
          "costPerRecipeUnit": 95.00
        }
      ]
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

**Utilisation frontend** :
```javascript
import { getMarketPricesWithIngredients } from '@/api'

const result = await getMarketPricesWithIngredients({
  page: 1,
  limit: 50,
  search: 'oignon',
  scope: 'all',
  goodType: 'Food'
})

// Afficher les MarketPrices et leurs ingrédients
result.data.forEach(mp => {
  console.log(`${mp.itemName} - ${mp.ingredients.length} ingrédient(s)`)
  mp.ingredients.forEach(ing => {
    console.log(`  - ${ing.name} (ID: ${ing.id})`)
  })
})
```

---

## Messages d'erreur

### Erreur : "Unknown ingredient ID(s)"

**Message complet** :
```
Unknown ingredient ID(s): clx123abc456. 
Make sure these IDs belong to the "ingredients" table, not "market_prices". 
Use POST /market-prices/sync-ingredients to auto-create missing ingredients from market prices.
```

**Cause** : Vous essayez d'utiliser un ID de `market_price` au lieu d'un ID d'`ingredient`.

**Solution** :
1. Vérifiez que vous utilisez bien un ID de la table `ingredient`
2. Si vous avez des MarketPrices sans Ingredient lié, exécutez la synchronisation :
   ```javascript
   await menuStore.syncMarketPriceIngredients()
   ```

---

## Schéma relationnel

```
┌─────────────────┐
│   MarketPrice   │
│  (Catalogue)    │
└────────┬────────┘
         │ 1
         │ marketPriceId (optional)
         │ n
┌────────▼────────┐
│   Ingredient    │
│   (Recette)     │
└────────┬────────┘
         │ 1
         │ ingredientId (required)
         │ n
┌────────▼────────────┐
│ ComponentIngredient │
│    (Jointure)       │
└─────────────────────┘
         │ n
         │ componentId
         │ 1
┌────────▼────────┐
│  MenuComponent  │
└─────────────────┘
```

---

## Bonnes pratiques

### ✅ À faire

1. **Créer des produits fournisseurs** dans MarketPrices
2. **Laisser le système auto-créer** les Ingredients correspondants
3. **Utiliser les Ingredients** (pas les MarketPrices) dans les composants
4. **Exécuter la sync** après import de données existantes

### ❌ À éviter

1. ❌ Essayer d'utiliser un `marketPriceId` dans `ComponentIngredient`
2. ❌ Créer manuellement des Ingredients pour chaque MarketPrice
3. ❌ Confondre les deux entités (elles ont des rôles différents)

---

## FAQ

### Q: Pourquoi deux tables séparées ?

**R:** Séparation des responsabilités :
- `MarketPrice` = données fournisseur (prix, disponibilité, conditionnement)
- `Ingredient` = données recette (coût par unité recette, conversions, utilisation)

Un même ingrédient peut avoir plusieurs MarketPrices (différents fournisseurs), mais un seul Ingredient de référence pour les recettes.

### Q: Que se passe-t-il si je supprime un MarketPrice ?

**R:** L'Ingredient lié reste intact (relation `onDelete: SetNull`). Le champ `marketPriceId` devient `null`, mais l'ingrédient reste utilisable dans les recettes.

### Q: Puis-je créer un Ingredient sans MarketPrice ?

**R:** Oui ! Le champ `marketPriceId` est optionnel. Vous pouvez créer un Ingredient directement via `POST /ingredients` avec les coûts manuels.

### Q: Comment mettre à jour les prix ?

**R:** 
1. Mettez à jour le `MarketPrice` → `PATCH /market-prices/:id`
2. Le coût dans `Ingredient` n'est **pas** automatiquement mis à jour (découplage intentionnel)
3. Si besoin, mettez à jour manuellement l'Ingredient → `PATCH /ingredients/:id`

---

## Changelog

### 2025-03-26 : Corrections appliquées

1. ✅ Auto-création d'`Ingredient` lors de la création d'un `MarketPrice` (Food/Beverage)
2. ✅ Ajout de l'endpoint `POST /market-prices/sync-ingredients`
3. ✅ `recipeUnit` et `purchaseUnit` rendus **requis** dans `CreateIngredientDto`
4. ✅ Amélioration du message d'erreur dans `assertIngredientsExist`
5. ✅ Ajout de `syncMarketPriceIngredients()` dans le store frontend

---

## Support

Pour toute question ou problème, consultez :
- Ce document
- Le schéma Prisma : `prisma/schema.prisma`
- Les services : `src/features/market-prices/`, `src/features/ingredients/`
