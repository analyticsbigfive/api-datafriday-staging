# Weezevent — Récupération exhaustive des transactions

> **Contexte** : l'API Weezevent plafonne toutes les réponses à **500 éléments maximum**, quelle que soit la plage de dates ou la valeur de `per_page`. Ce document décrit la stratégie mise en place pour contourner ce plafond et récupérer l'intégralité des transactions.

---

## 1. Limite de l'API Weezevent

L'endpoint Weezevent utilisé :

```
GET /pay/v1/organizations/:organizationId/transactions
```

Paramètres de filtrage acceptés :

| Paramètre         | Description                        |
|-------------------|------------------------------------|
| `created_at__gte` | Date de début (ISO 8601)           |
| `created_at__lte` | Date de fin (ISO 8601)             |
| `per_page`        | Résultats par page (max côté back) |
| `page`            | Page demandée                      |

**Comportement observé** : quelle que soit la plage de dates, Weezevent retourne systématiquement :

```json
{
  "data": [...],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total": 500,
    "total_pages": 1
  }
}
```

- `total: 500` est un indicateur de cap, pas le vrai total.
- `total_pages: 1` indique que Weezevent considère la réponse comme complète — ce qui est faux.
- Il est **impossible de paginer au-delà** de ce plafond via `page`.

---

## 2. Stratégie : découpage adaptatif par bissection

### Principe

Pour une plage de dates donnée (`fromDate` → `toDate`) :

1. Envoyer une requête pour la plage entière.
2. Si `meta.total < 500` → la réponse est **complète**, on conserve les données.
3. Si `meta.total >= 500` → le cap est atteint, la réponse est **tronquée**.
   - Couper la plage en **deux moitiés égales** (par timestamp milliseconde).
   - Répéter récursivement sur chaque moitié.
4. Arrêt possible uniquement si :
   - `total < 500` (données complètes), ou
   - La plage est inférieure à **1 seconde** (découpage impossible).

### Découpage en mois en premier

Avant la bissection récursive, la plage globale est découpée en **tranches mensuelles** pour limiter le nombre de requêtes par récursion :

- Le premier mois commence au **jour exact** de la date de début saisie.
- Le dernier mois se termine au **jour exact** de la date de fin saisie.
- Les mois intermédiaires couvrent le mois entier (1er → dernier jour).

### Illustration

```
Plage : juin 2025 → mai 2026  →  12 tranches mensuelles

Tranche : juin 2025
  GET juin 2025  →  total=500 ❌ (cap atteint)
    GET 01/06 → 16/06  →  total=312 ✅
    GET 16/06 → 30/06  →  total=500 ❌
      GET 16/06 → 23/06  →  total=198 ✅
      GET 23/06 → 30/06  →  total=302 ✅
  → juin 2025 : 812 transactions réelles

Tranche : juillet 2025
  GET juillet 2025  →  total=143 ✅
  → juillet 2025 : 143 transactions réelles
```

---

## 3. Architecture technique

### Backend — endpoint proxy

```
GET /weezevent/raw-transactions
Authorization: Bearer <jwt>
```

Paramètres query :

| Paramètre       | Type   | Description                              |
|-----------------|--------|------------------------------------------|
| `integrationId` | string | ID de l'intégration `WeezeventIntegration` |
| `fromDate`      | string | ISO 8601 — début de plage                |
| `toDate`        | string | ISO 8601 — fin de plage                  |

- Le backend vérifie que l'intégration appartient bien au tenant de l'utilisateur connecté.
- Il appelle `WeezeventClientService.getTransactions()` qui traduit `fromDate`/`toDate` en `created_at__gte`/`created_at__lte`.
- La réponse Weezevent est renvoyée **telle quelle** au frontend (pas de transformation).

### Frontend — algorithme `fetchChunk`

Implémenté dans `StepProcessTimeline.vue`, méthode `handleDebugTransactionFetch` :

```js
const WEEZEVENT_CAP = 500

const fetchChunk = async (fromIso, toIso, depth = 0) => {
  const result = await getWeezeventRawTransactions({ integrationId, fromDate: fromIso, toDate: toIso })
  const items = result?.data ?? []
  const total = result?.meta?.total ?? items.length

  if (total < WEEZEVENT_CAP) {
    return items // données complètes
  }

  const startMs = new Date(fromIso).getTime()
  const endMs   = new Date(toIso).getTime()

  if (endMs - startMs < 1000) {
    // Plage < 1 seconde : impossible de découper davantage
    console.warn(`Cap Weezevent irréductible sur cette plage`)
    return items
  }

  const midMs = Math.floor((startMs + endMs) / 2)
  const firstHalf  = await fetchChunk(fromIso, new Date(midMs - 1).toISOString(), depth + 1)
  const secondHalf = await fetchChunk(new Date(midMs).toISOString(), toIso, depth + 1)
  return [...firstHalf, ...secondHalf]
}
```

---

## 4. Lecture des logs console

À chaque requête, la console affiche :

```
[chunk] 2025-06-01T00:00:00.000Z → 2025-06-30T23:59:59.999Z | total=500 data=500
  [chunk] 2025-06-01T00:00:00.000Z → 2025-06-15T11:59:59.999Z | total=312 data=312
  [chunk] 2025-06-15T12:00:00.000Z → 2025-06-30T23:59:59.999Z | total=500 data=500
    [chunk] 2025-06-15T12:00:00.000Z → 2025-06-23T05:59:59.999Z | total=198 data=198
    [chunk] 2025-06-23T06:00:00.000Z → 2025-06-30T23:59:59.999Z | total=302 data=302
✅ juin 2025 : 812 transaction(s)
```

- `total` = valeur `meta.total` renvoyée par Weezevent (500 = cap atteint).
- `data` = nombre d'éléments effectivement dans `data[]`.
- Un warning `⚠️ Plage < 1s` indique un cas extrême où Weezevent plafonne sur une plage inférieure à la seconde (rare, improbable en production).

---

## 5. Cas limites connus

| Situation | Comportement |
|-----------|-------------|
| Mois avec 0 transaction | `total=0 < 500` → retourné immédiatement, 0 items |
| Mois avec exactement 499 transactions | Retourné en une seule requête |
| Mois avec 500+ transactions | Bissection récursive jusqu'à `total < 500` |
| Plage < 1 seconde avec 500 résultats | Warning + items partiels retournés (irréductible) |
| Date de fin = aujourd'hui | Fonctionne normalement, Weezevent filtre sur `created_at__lte` |

---

## 6. Fichiers impliqués

| Fichier | Rôle |
|---------|------|
| `src/features/weezevent/weezevent.controller.ts` | Endpoint `GET /weezevent/raw-transactions` |
| `src/features/weezevent/services/weezevent-client.service.ts` | Appel HTTP Weezevent, mapping `fromDate`→`created_at__gte` |
| `src/features/weezevent/dto/get-transactions-query.dto.ts` | Validation des paramètres query |
| `datafriday-web/src/api/endpoints/aggregation.api.js` | `getWeezeventRawTransactions()` — appel frontend |
| `datafriday-web/src/components/integration/wizard/StepProcessTimeline.vue` | UI debug + algorithme `fetchChunk` |
