# Brief DEV FRONT — RestockState : persistance BDD

Objectif : l'état de réarmement (`SpaceRestockView`) survit au **changement de
machine et au vidage du cache**. Le front est déjà câblé et fonctionne — ce doc
explique ce qui a changé, comment ça marche, et ce qu'il ne faut pas casser.

---

## TL;DR

| Ce qui existait | Ce qui a changé |
|---|---|
| `restoreRestockState()` lisait `localStorage` | Essaie `GET /spaces/:spaceId/restock-state` en premier ; LS si null ou API down |
| `persistRestockState()` écrivait `localStorage` | Écrit `localStorage` immédiat **+** `PUT` API débouncé 500 ms |
| Aucune route backend | 3 routes NestJS + table `RestockState` en BDD |

**Aucun autre fichier front modifié.** Le reste de la vue est inchangé.

---

## Fichiers concernés

```
datafriday-web/
  src/
    api/endpoints/restock.api.js      ← nouveau (client HTTP)
    views/SpaceRestockView.vue        ← 3 zones modifiées (import + 2 méthodes)
```

---

## Comportement exact

### Au chargement (`restoreRestockState`)

```
1. GET /api/v1/spaces/:spaceId/restock-state
   ├── 200 { state: {...} }  →  applique l'état + miroir localStorage
   ├── 200 null              →  tombe sur localStorage (aucun état en BDD)
   └── erreur réseau / 5xx  →  marque API indisponible (session) + localStorage
```

L'API est **source autoritaire**. Le localStorage reste le fallback offline.

### À chaque changement d'état (`persistRestockState`)

```
1. localStorage.setItem(...)          ← immédiat, synchrone (0 ms)
2. setTimeout(PUT /restock-state, 500ms)
   ├── si l'utilisateur change encore → clearTimeout + reset 500 ms
   └── si silencieux 500 ms           → PUT envoyé
```

Le localStorage garantit qu'aucun état n'est perdu si l'utilisateur ferme
l'onglet avant les 500 ms.

### Navigation / démontage

`beforeUnmount()` annule le timer en cours → pas d'appel API sur composant
démonté.

---

## Stratégie d'erreur API (`isRestockApiDown`)

Défini dans `src/api/endpoints/restock.api.js` :

```js
// Bascule à true sur réseau / timeout / 5xx. JAMAIS sur 4xx.
let _apiDown = false

export function isRestockApiDown() { return _apiDown }
export function onRestockApiError(err) {
  const status = err?.response?.status
  if (status && status >= 400 && status < 500) return  // 4xx = API up, erreur applicative
  _apiDown = true
}
```

Une fois down, **toute la session reste sur localStorage** sans re-tenter.
Identique au pattern `useEventPredictVersions.js`.

---

## Ce que le DTO envoie (PUT body)

Le `snapshot` envoyé est exactement `restockPersistSnapshot` (computed dans la
vue) — 9 champs :

```js
{
  objectiveSource,    // 'sales' | 'forecast'
  referenceEventId,   // string | null
  selectedEventIds,   // string[]
  stockAdjustments,   // Record<string, number>
  stockPackedModes,   // Record<string, unknown>
  restockedRows,      // Record<string, unknown>
  restockGenerated,   // boolean
  shoppingGenerated,  // boolean
  restockViewMode,    // 'shop' | 'item'
}
```

Le backend stocke ce blob tel quel en `jsonb`. La réponse inclut `{ id, state,
updatedAt }` — le front ignore tout sauf `state`.

---

## Ce que ça ne couvre PAS (connu et accepté)

| Donnée | Stockage | Cross-machine |
|---|---|---|
| État réarmement (9 champs) | BDD ✅ | ✅ |
| Inventaire (counts) | BDD ✅ | ✅ |
| Versions EventPredict | localStorage (REST_ENABLED=false) | ❌ → passer `REST_ENABLED=true` |
| Records de prédiction (cache calcul) | localStorage | ❌ → régénérer via EventPredict |

Pour le mode "Prévision" sur nouvelle machine : les sélections et ajustements
sont restaurés, mais le tableau de réarmement reste vide jusqu'à ce que
l'utilisateur ouvre EventPredict → relance son scénario → les records sont
recalculés et mis en cache. C'est le comportement attendu.

---

## Pour activer la persistance EventPredict (étape suivante)

Une seule ligne dans `src/composables/useEventPredictVersions.js` :

```js
const REST_ENABLED = false  // → true
```

Les routes backend sont déjà déployées. Une fois `true`, les scénarios
EventPredict sont aussi cross-machine → le mode "Prévision" est alors
entièrement restaurable sans aller-retour manuel dans EventPredict.

---

## Déploiement requis

Avant de tester en staging, appliquer la migration :

```bash
# Dans api-datafriday-staging/
npx prisma migrate deploy
# ou
npx prisma db push
```

Table créée : `RestockState` avec contrainte `UNIQUE(tenantId, spaceId)`.
