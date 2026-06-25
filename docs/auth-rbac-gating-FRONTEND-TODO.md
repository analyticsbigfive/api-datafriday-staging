# Frontend TODO — Gating RBAC (Phase 1)

> **Pour l'équipe front (`datafriday-web`).** Le backend applique désormais le RBAC fin sur les
> **écritures** des routes métier (Phase 1, livrée 2026-06-25). Le front doit **refléter** ces droits
> (masquer ce que l'utilisateur ne peut pas faire) — sinon l'UI propose des actions qui renvoient `403`.
>
> Rappel : **le back refuse, le front masque**. Ce TODO = couche UX/défense en profondeur, pas la sécurité.

---

## 0. Ce qui a changé côté backend (déjà en prod)

- Chaque **écriture** (POST/PATCH/PUT/DELETE) des contrôleurs métier exige maintenant une **permission**
  (`@RequirePermissions(...)`). Un utilisateur sans la permission reçoit **403** (intercepté → toast
  « Accès interdit »).
- Les **lectures (GET) restent ouvertes** à tout membre du tenant (le filtrage lecture viendra en Phase 2).
- **ADMIN** = toutes permissions (jamais bloqué). **MANAGER** ≈ tout l'opérationnel. **STAFF** = F&B de base.
  **VIEWER** = lecture seule (ne peut plus rien écrire).
- Nouveau champ exposé par `GET /me` → `isSuperAdmin: boolean` (super-admin plateforme).

> Tout est déjà disponible côté store : `auth/can('<code>')`, `auth/permissions`, `auth/userRole`.
> **`can()` n'est aujourd'hui appelé nulle part** → c'est le cœur du travail ci-dessous.

---

## 1. Matrice rôle → permission (source de vérité, alignée backend)

| Permission | ADMIN | MANAGER | STAFF | VIEWER |
|------------|:-:|:-:|:-:|:-:|
| `menu.fb.suppliers` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.marketPrices` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.menuItems` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.spaceMenu` | ✅ | ✅ | ✅ | ❌ |
| `menu.fb.components` | ✅ | ✅ | ❌ | ❌ |
| `menu.events.manage` | ✅ | ✅ | ❌ | ❌ |
| `menu.config.manage` | ✅ | ✅ | ❌ | ❌ |
| `menu.integration.fb` | ✅ | ✅ | ❌ | ❌ |
| `org.users.view` | ✅ | ✅ | ❌ | ❌ |
| `org.users.manage` | ✅ | ✅ | ❌ | ❌ |
| `org.users.changeRole` | ✅ | ❌ | ❌ | ❌ |
| `org.roles.manage` | ✅ | ❌ | ❌ | ❌ |
| `org.permissions.manage` | ✅ | ❌ | ❌ | ❌ |

> `can(code)` renvoie déjà `true` pour ADMIN quel que soit le code.

---

## 2. Permission appliquée par surface d'écriture (back) — à recopier côté boutons

| Domaine / écran | Code permission | Routes back gatées |
|-----------------|-----------------|--------------------|
| Fournisseurs | `menu.fb.suppliers` | `POST/PATCH/DELETE /suppliers` |
| Prix du marché | `menu.fb.marketPrices` | `POST/PATCH/DELETE /market-prices` |
| Composants | `menu.fb.components` | `POST/PATCH/PUT/DELETE /menu-components` |
| Articles de menu | `menu.fb.menuItems` | `POST/PATCH/PUT/DELETE /menu-items`, `/product-types`, `/product-categories` |
| Ingrédients / Packaging | `menu.fb.menuItems` | écritures `/ingredients`, `/packaging` |
| Menus d'espace | `menu.fb.spaceMenu` | `POST /space-menu` |
| Marques / Noms d'affichage | `menu.config.manage` | écritures `/brand-names`, `/display-names` |
| Événements (+ types/cat./sous-cat.) | `menu.events.manage` | écritures `/events`, `/event-*`, `/predict-versions` |
| Intégration (mappings, Weezevent, agrégation) | `menu.integration.fb` | écritures `/mappings`, `/integrations`, `/weezevent`, `/aggregation` |
| Utilisateurs | `org.users.manage` (créer/éditer) · `org.users.changeRole` (rôle) | `/users*` |
| Rôles | `org.roles.manage` | `/roles*` |
| Permissions | `org.permissions.manage` | `/permissions*` |
| Métriques `/metrics` | **super-admin uniquement** | `GET /metrics` (403 si non super-admin) |

> ⚠️ **Note produit** : avec cette matrice, un **STAFF ne peut plus écrire** événements / composants /
> configuration / intégration (il garde fournisseurs / prix / articles / menus d'espace). Si tu veux
> qu'un STAFF gère aussi les événements, il suffira d'ajouter `menu.events.manage` au rôle STAFF
> (via l'UI rôles, sans déploiement). À valider côté métier.

---

## 3. Travail à faire (3 niveaux)

### 3.1 Gating du menu — `src/views/DashboardView.vue`
Ajouter `v-if="can('<code>')"` sur les entrées du drawer « Paramètres » :

```vue
<!-- import: ...mapGetters('auth', ['can']) -->
<!-- Menu F&B -->
<v-list-item v-if="can('menu.fb.suppliers')"     :title="t('suppliers')"        @click="goToSuppliersFromSettings" />
<v-list-item v-if="can('menu.fb.marketPrices')"  :title="t('navMarketPricesList')" @click="goToMarketPricesFromSettings" />
<v-list-item v-if="can('menu.fb.components')"     :title="t('navComponents')"     @click="goToComponentsFromSettings" />
<v-list-item v-if="can('menu.fb.menuItems')"      :title="t('navMenuItems')"      @click="goToMenuItemsFromSettings" />
<v-list-item v-if="can('menu.fb.spaceMenu')"      :title="t('navSpaceMenu')"      @click="goToSpaceMenusFromSettings" />
<!-- Events / Config / Intégration -->
<v-list-group v-if="can('menu.events.manage')">  … Events … </v-list-group>
<v-list-group v-if="can('menu.config.manage')">  … Product types/cat., Marques … </v-list-group>
<v-list-item  v-if="can('menu.integration.fb')"  :title="t('navDataIntegration')" @click="goToFbIntegrationFromSettings" />
<!-- Organisation -->
<v-list-item  v-if="can('org.users.view')"   :title="t('navUsers')"  @click="goToUsersFromSettings" />
<v-list-group v-if="can('org.roles.manage')"> … Rôles … </v-list-group>
```

### 3.2 Guard de route par permission — `src/router/guards.js` + `index.js`
Remplacer les guards morts `requireAdmin`/`requireManager` par une fabrique générique :

```js
// guards.js
export function requirePermission(code) {
  return async (to, from, next) => {
    if (!store.getters['auth/isInitialized']) await store.dispatch('auth/initialize')
    if (!store.getters['auth/isAuthenticated']) return next({ path: '/login', query: { redirect: to.fullPath } })
    if (!store.getters['auth/hasOrganization']) return next('/onboarding')
    return store.getters['auth/can'](code) ? next() : next('/spaces')
  }
}
```

```js
// index.js — appliquer beforeEnter SUR CHAQUE route enfant concernée
{ path: '/users',        beforeEnter: requirePermission('org.users.view'),        … }
{ path: '/users/create', beforeEnter: requirePermission('org.users.manage'),      … }
{ path: '/roles',        beforeEnter: requirePermission('org.roles.manage'),      … }
{ path: '/permissions',  beforeEnter: requirePermission('org.permissions.manage'),… }
{ path: '/suppliers',    beforeEnter: requirePermission('menu.fb.suppliers'),     … }
// … idem market-prices, components, menu-items, space-menus, events*, product-*, brand-names, data-integration/fb
```
> Rappel vue-router : les enfants de `/dashboard` n'héritent pas du `beforeEnter` parent → le poser sur chaque enfant.

### 3.3 Boutons d'action intra-page (Créer / Éditer / Supprimer)
Sur chaque écran, conditionner les boutons d'écriture avec le **même code** que le back (cf. §2) :

```vue
<v-btn v-if="can('menu.fb.suppliers')" @click="createSupplier">Nouveau fournisseur</v-btn>
<v-btn v-if="can('menu.fb.suppliers')" @click="editSupplier(item)">Éditer</v-btn>
<v-btn v-if="can('menu.fb.suppliers')" color="error" @click="deleteSupplier(item)">Supprimer</v-btn>
```
Idéalement, créer un composant réutilisable `<Can permission="...">…</Can>` (slot) pour ne pas dupliquer.

---

## 4. CRUD utilisateur (préparation Phase 2)
- `UserCreateView` envoie déjà `roleId` → OK.
- À venir (Phase 2) : ajouter au formulaire la sélection des **espaces accessibles** (toggle « tous les
  espaces » + multi-select). Le backend exposera `allSpaces` / `spaceAccess[]` dans `POST /users`.
  Ne rien coder maintenant côté espaces — un second handoff suivra quand le backend Phase 2 sera prêt.

## 5. Super-admin (préparation)
- `GET /me` renvoie maintenant `isSuperAdmin`. Stocker ce flag dans le store `auth` (à côté de `userRole`)
  et prévoir une entrée de menu/route `/super-admin` **visible uniquement si `isSuperAdmin`** (UI à venir).

---

## 6. Checklist front
- [ ] `can()` câblé sur toutes les entrées de menu sensibles (§3.1).
- [ ] `requirePermission()` sur les routes sensibles ; `requireAdmin`/`requireManager` supprimés (§3.2).
- [ ] Boutons Créer/Éditer/Supprimer gatés sur chaque écran métier (§3.3).
- [ ] `isSuperAdmin` stocké dans le store `auth`.
- [ ] Vérifié à la main avec un compte VIEWER (ne voit aucune action d'écriture) et STAFF (F&B seulement).
