# Système de Gestion des Shops

## Vue d'ensemble

Le système de shops dans DataFriday permet de gérer les points de vente (F&B, merchandising, etc.) au sein de vos espaces et de les lier aux données de vente provenant de Weezevent.

## Architecture

### 1. Création des Shops (VOS données)

Les shops sont des **SpaceElements** créés dans les configurations de vos espaces :

```
Space → Config → Floor/Forecourt → SpaceElement (shop)
```

**Types de shops supportés :**
- `shop` - Point de vente générique
- `fnb_food` - Food & Beverage - Nourriture
- `fnb_beverages` - Food & Beverage - Boissons
- `fnb_bar` - Food & Beverage - Bar
- `fnb_snack` - Food & Beverage - Snacks
- `fnb_icecream` - Food & Beverage - Glaces
- `merchshop` - Merchandising

### 2. Mapping avec Weezevent (optionnel)

Une fois vos shops créés, vous pouvez les mapper avec les merchants Weezevent pour récupérer les données de vente :

```
SpaceElement (votre shop) ←→ WeezeventMerchantElementMapping ←→ WeezeventMerchant
```

**Table de mapping :** `WeezeventMerchantElementMapping`
- `spaceElementId` : ID de votre shop
- `weezeventMerchantId` : ID du merchant Weezevent
- `tenantId` : ID de votre organisation

### 3. Agrégation des Données de Vente

Les données de vente Weezevent sont agrégées quotidiennement dans `SpaceRevenueDailyAgg` :

```sql
SpaceRevenueDailyAgg {
  spaceId: string           -- Votre espace
  spaceElementId: string    -- Votre shop (si mappé)
  day: Date                 -- Jour
  revenueHt: Decimal        -- Revenu HT
  transactionsCount: int    -- Nombre de transactions
  itemsCount: int           -- Nombre d'items vendus
}
```

## Flux de Données

### Création d'un Shop

1. **Créer une configuration** pour votre espace
   ```
   POST /configurations
   {
     "spaceId": "space-123",
     "name": "Configuration Match",
     "data": {
       "floors": [{
         "name": "Niveau 1",
         "elements": [{
           "name": "Bar Principal",
           "type": "fnb-bar",
           "x": 100,
           "y": 200,
           ...
         }]
       }]
     }
   }
   ```

2. Le système crée automatiquement le **SpaceElement** (shop) dans la base de données

### Récupération des Shops

**Endpoint :** `GET /spaces/:id/shop-details`

**Réponse :**
```json
[
  {
    "shopId": "element-abc123",
    "shopName": "Bar Principal",
    "shopType": "fnb-bar",
    "shopSubTypes": ["bar", "premium"],
    "configId": "config-xyz",
    "configName": "Configuration Match",
    "locationId": "floor-123",
    "locationName": "Niveau 1",
    "locationType": "floor",
    "revenue": 15420.50,
    "transactionCount": 342,
    "itemsCount": 1205,
    "isMappedToWeezevent": true,
    "weezeventMerchantId": "merchant-456"
  }
]
```

### Mapping avec Weezevent

Pour lier un shop à un merchant Weezevent, créez un mapping :

```sql
INSERT INTO WeezeventMerchantElementMapping (
  tenantId,
  spaceElementId,
  weezeventMerchantId
) VALUES (
  'tenant-123',
  'element-abc123',
  'merchant-456'
);
```

Une fois mappé, les données de vente Weezevent seront automatiquement associées à votre shop.

## Cas d'Usage

### 1. Lister tous les shops d'un espace

```typescript
const shops = await spacesService.getShopDetails(spaceId, tenantId);
```

Retourne **TOUS** les shops créés dans les configurations, qu'ils soient mappés à Weezevent ou non.

### 2. Identifier les shops non mappés

```typescript
const unmappedShops = shops.filter(s => !s.isMappedToWeezevent);
```

Utile pour savoir quels shops n'ont pas encore de données de vente Weezevent.

### 3. Analyser les performances par shop

```typescript
const topShops = shops
  .filter(s => s.revenue > 0)
  .sort((a, b) => b.revenue - a.revenue)
  .slice(0, 10);
```

### 4. Filtrer par type de shop

```typescript
const fnbShops = shops.filter(s => s.shopType.startsWith('fnb-'));
const merchShops = shops.filter(s => s.shopType === 'merchshop');
```

## Différence avec l'Ancien Système

### ❌ Ancien (incorrect)
```
getShopDetails() → Query Weezevent → Retourne merchants Weezevent
```
**Problème :** Retournait les données Weezevent, pas VOS shops créés.

### ✅ Nouveau (correct)
```
getShopDetails() → Query SpaceElements → Join avec données Weezevent si mappé
```
**Avantage :** Retourne VOS shops créés, avec optionnellement les données de vente.

## Points Importants

1. **Les shops existent indépendamment de Weezevent**
   - Vous créez vos shops via les configurations
   - Le mapping Weezevent est optionnel

2. **Un shop peut exister sans données de vente**
   - `revenue: 0` si pas mappé ou pas de ventes
   - `isMappedToWeezevent: false` si pas de mapping

3. **Les shops sont liés aux configurations**
   - Si vous supprimez une configuration, les shops associés sont supprimés (cascade)
   - Un shop appartient toujours à un floor ou forecourt

4. **Les données de vente sont agrégées**
   - `SpaceRevenueDailyAgg` contient les totaux par jour
   - Pour des détails plus granulaires, utilisez les tables de transactions Weezevent

## Prochaines Étapes

1. **Interface de mapping** : Créer une UI pour mapper les shops aux merchants Weezevent
2. **Synchronisation automatique** : Automatiser l'agrégation des données de vente
3. **Analytics avancés** : Ajouter des métriques de performance par shop
4. **Export de données** : Permettre l'export des données de shops pour analyse externe
