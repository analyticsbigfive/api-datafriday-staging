# Handoff Front — Alignement RBAC « Permissions (rôles) » (2026-06-26)

> Périmètre : **backend livré**, ce document liste ce que le **front** (`datafriday-web/`) doit
> mettre à jour pour exploiter le nouveau catalogue. Source de vérité backend :
> [`api-datafriday-staging/src/core/rbac/permission-catalog.ts`](../src/core/rbac/permission-catalog.ts).
> Côté front, à reporter dans `src/constants/navigation.js` + gating `v-can` (cf.
> `datafriday-web/docs/RBAC_SYSTEM.md` §3-§4).

## 1. Ce qui change côté backend (déjà fait)

- Rôles système = **ADMIN + 6 rôles métier** (Analyste F&B, Logistic F&B, Technicien Logistic,
  PDV Superviseur, Achat F&B, Chef). MANAGER/STAFF/VIEWER ne sont plus seedés.
- `GET /me` renvoie toujours `role.{ systemKey, isSystem, permissions[] }`. Pour les rôles métier
  `systemKey = null` → le front **ne doit pas** se baser sur `systemKey`/nom de rôle pour gater,
  mais uniquement sur `permissions[]` (codes) + bypass `isAdmin` (`systemKey === 'ADMIN'`).
- Nouveaux endpoints gardés par permission : `analyse`, `inventory`, `restock-state`, écritures `spaces`.

## 2. Nouveaux codes de permission (catalogue) à câbler dans le menu

| Code | Écran / item de menu | Catégorie |
|---|---|---|
| `space.edit` | Édition d'un espace (CRUD, accès, floor) | Edit Space |
| `front.fb.analyse` | Analyse | F&B Front |
| `front.fb.eventPredict` | Event Predict | F&B Front |
| `front.fb.predict` | Predict | F&B Front |
| `front.fb.spaceInventory` | Space Inventory | F&B Front |
| `front.fb.stockUp` | Stock Up | F&B Front |
| `front.fb.live` | Live | F&B Front |
| `front.fb.shoppingList` | Liste de course | F&B Front |
| `front.fb.restock` | Réarmement | F&B Front |
| `front.fb.restockBoard` | Tableau de Réarmement | F&B Front |
| `back.fb.costTracking` | Cost Tracking | F&B Back |
| `back.fb.marginReport` | Margin Report | F&B Back |
| `menu.hr.manage` | Edit HR (placeholder, pas d'écran back encore) | Edit HR |

Codes **inchangés** réutilisés : `nav.spaces`, `menu.fb.suppliers`, `menu.fb.marketPrices`,
`menu.fb.components`, `menu.fb.menuItems`, `menu.fb.spaceMenu`, `menu.events.manage`,
`menu.config.manage`, `menu.integration.fb`, `org.users.*`, `org.roles.manage`, `org.permissions.manage`.

> `nav.analytics.fb` est **remplacé** par `front.fb.analyse` pour l'écran Analyse (l'ancien code reste
> au catalogue pour compat mais les rôles métier pointent sur `front.fb.analyse`).

## 3. Matrice rôle → écrans (pour QA et libellés)

| Rôle | Écrans accessibles |
|---|---|
| **Analyste F&B** | FRONT: Analyse, Event Predict, Predict, Space Inventory, Stock Up, Live, Liste de course — BACK: Cost Tracking, Margin Report |
| **Logistic F&B** | FRONT: Space Inventory, Réarmement |
| **Technicien Logistic** | FRONT: Tableau de Réarmement |
| **PDV Superviseur** | FRONT: Space Inventory, Tableau de Réarmement |
| **Achat F&B** | BACK: Suppliers, Market Price List — FRONT: Analyse, Event Predict, Predict, Space Inventory, Stock Up, Live, Liste de course |
| **Chef** | BACK: Components, Menu Items, Space Menus |
| **ADMIN** | Tout (bypass) |

## 4. TODO front

1. `src/constants/navigation.js` : ajouter les items front (Analyse, Predict, Live, Stock Up, Liste de
   course, Réarmement, Tableau de Réarmement, Space Inventory, Event Predict) avec leur `permission`,
   et les items back Cost Tracking / Margin Report.
2. Gating `v-can` / `requirePermission` sur les routes correspondantes.
3. `UserEditDrawer` : le sélecteur de rôle est déjà dynamique (`GET /roles`) → il listera
   automatiquement ADMIN + 6 rôles métier. Vérifier l'affichage des rôles `systemKey = null`.
4. Un **membre auto-inscrit** (join par code/slug) n'a désormais **aucun rôle fonctionnel**
   (`roleId = null`) tant qu'un admin ne lui en attribue pas un → prévoir un état « sans accès / en
   attente d'attribution » plutôt qu'un menu vide non explicité.

## 5. Hors périmètre (backend, lots ultérieurs)
- `Administrateur de site` : gestion d'utilisateurs scopée par site (mécanisme nouveau).
- Endpoints back dédiés pour Cost Tracking / Margin Report / Predict / Stock Up / Live / Liste de
  course / Edit HR (codes présents au catalogue, enforcement back à ajouter quand l'écran existera).
