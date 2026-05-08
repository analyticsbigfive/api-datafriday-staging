# Frontend — Contrats API Composition (Menu Items + Menu Components)

Ce document décrit les endpoints et les payloads à utiliser dans la **refonte frontend** pour manipuler la composition (ingrédients / composants / packagings) de manière **relationnelle** et **analytics-ready**.

## Principes

- La composition est gérée par des tables relationnelles.
- Les endpoints "replace" remplacent **toute** la liste de lignes (idempotent).
- Les coûts (`unitCost`, `totalCost`, `MenuItem.totalCost`) sont recalculés via `refresh-costs`.
- `componentsData` (JSON) est **legacy**.
  - Toujours envoyé par l’API pour compat.
  - Ne pas l’utiliser dans la refonte.

## Auth / Headers

- `Authorization: Bearer <token>`
- `Content-Type: application/json`

---

# Menu Items

## Lire un menu item

`GET /menu-items/:id`

Retour attendu (extraits) :

- `components[]` (lignes) : `componentId`, `numberOfUnits`, `unitCost`, `totalCost`, `storageType`, etc.
- `ingredients[]` (lignes)
- `packagings[]` (lignes)
- `totalCost` (matérialisé)
- `margin` (matérialisé)

## Remplacer les composants d’un menu item

`PUT /menu-items/:id/components`

Payload :

```json
{
  "components": [
    { "componentId": "cmp_123", "numberOfUnits": 2 },
    { "componentId": "cmp_456", "numberOfUnits": 0.5 }
  ]
}
```

Comportement :

- Remplace l’intégralité des lignes `MenuItemComponent`
- Déclenche un recalcul de coûts sur le menu item
- Retourne le menu item mis à jour

## Remplacer les ingrédients d’un menu item

`PUT /menu-items/:id/ingredients`

Payload :

```json
{
  "ingredients": [
    { "ingredientId": "ing_123", "numberOfUnits": 10 }
  ]
}
```

## Remplacer les packagings d’un menu item

`PUT /menu-items/:id/packagings`

Payload :

```json
{
  "packagings": [
    { "packagingId": "pkg_123", "numberOfUnits": 1 }
  ]
}
```

## Refresh ciblé des coûts d’un menu item (ergonomique UI)

`POST /menu-items/:id/refresh-costs`

Payload : aucun.

Comportement :

- Recalcule les `unitCost`/`totalCost` des lignes
- Recalcule `MenuItem.totalCost` et `MenuItem.margin`
- Retourne le menu item mis à jour

## Refresh global des coûts (batch)

`POST /menu-items/refresh-costs`

Payload : aucun.

---

# Menu Components (recettes / ensembles d’ingrédients)

## Remplacer les ingrédients d’un composant

`PUT /menu-components/:id/ingredients`

Payload :

```json
{
  "ingredients": [
    { "ingredientId": "ing_123", "numberOfUnits": 10 }
  ]
}
```

## Remplacer les sous-composants (enfants) d’un composant

`PUT /menu-components/:id/children`

Payload :

```json
{
  "children": [
    { "childComponentId": "cmp_child_123", "numberOfUnits": 1 }
  ]
}
```

## Refresh global des coûts des composants

`POST /menu-components/refresh-costs`

Payload : aucun.

---

# Migration / Legacy

## `componentsData`

- Champ JSON historique sur `MenuItem`.
- La refonte frontend doit passer par les endpoints relationnels ci-dessus.

## Ordre recommandé côté UI

1. `PUT /menu-items/:id/components` et/ou `PUT /menu-items/:id/ingredients` et/ou `PUT /menu-items/:id/packagings`
2. (Optionnel) `POST /menu-items/:id/refresh-costs`
   - Souvent inutile car les endpoints `PUT` font déjà un refresh côté backend.
3. `GET /menu-items/:id` pour afficher la version à jour.
