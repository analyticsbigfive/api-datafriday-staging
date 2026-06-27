# Documentation Technique — Wizard d'Intégration Weezevent

**Destinataire :** Équipe Backend  
**Auteur :** Équipe Frontend DataFriday  
**Date :** 2026-06-26  
**Version :** 2.0

---

## Table des matières

1. [Vue d'ensemble du wizard](#1-vue-densemble-du-wizard)
2. [Flux détaillé étape par étape](#2-flux-détaillé-étape-par-étape)
3. [La configuration "Weezevent Import" — comportement observé](#3-la-configuration-weezevent-import--comportement-observé)
4. [Bug critique identifié — `assign-floor` et positionnement dans la config utilisateur](#4-bug-critique-identifié--assign-floor-et-positionnement-dans-la-config-utilisateur)
5. [Endpoint `quick-element` — discordance d'URL](#5-endpoint-quick-element--discordance-durl)
6. [Endpoint `assign-floor` — non documenté](#6-endpoint-assign-floor--non-documenté)
7. [Coexistence de deux configurations par Space](#7-coexistence-de-deux-configurations-par-space)
8. [Récapitulatif des demandes au backend](#8-récapitulatif-des-demandes-au-backend)

---

## 1. Vue d'ensemble du wizard

Le wizard d'intégration Weezevent est une interface en 4 étapes permettant de connecter les données Weezevent (locations, shops, menu items, événements) à un espace DataFriday en 3D.

```
Étape 1          Étape 2           Étape 3            Étape 4
┌──────────┐    ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ Associer │───▶│ Mapper les   │──▶│ Mapper les   │──▶│ Timeline des     │
│ un Space │    │ Shops        │   │ Menu Items   │   │ Événements       │
└──────────┘    └──────────────┘   └──────────────┘   └──────────────────┘
  StepMapSpace   StepMapShops       StepMapMenuItems   StepProcessTimeline
```

| Étape | Composant | Endpoints appelés |
|---|---|---|
| 1 — Associer un Space | `StepMapSpace.vue` | `POST /spaces` · `POST /configurations` · `POST /mappings/location-space` |
| 2 — Mapper les Shops | `StepMapShops.vue` | `POST /spaces/:id/quick-element` · `POST /spaces/:id/assign-floor` · `POST /mappings/location-shop` |
| 3 — Mapper les Menu Items | `StepMapMenuItems.vue` | `POST /mappings/product-menu` |
| 4 — Timeline des événements | `StepProcessTimeline.vue` | Endpoints événements / timeline |

---

## 2. Flux détaillé étape par étape

### Étape 1 — Associer un Space

```
Utilisateur saisit : nom de l'espace + nom de la configuration
  → POST /spaces                   { name }
  ← { spaceId }
  → POST /configurations           { name: "Stade de Pau", spaceId }
  ← { configId }
  → POST /mappings/location-space  { locationId, spaceId }
  ← mapping créé
```

À l'issue de cette étape, le space et **une configuration utilisateur** (`configId`) sont créés.

---

### Étape 2 — Mapper les Shops

#### 2a. Création et mapping d'un shop (action unitaire)

```
Utilisateur clique "+" sur une location Weezevent
  → POST /spaces/:spaceId/quick-element   { name, type }
  ← { shopId, shopName, configName, locationName }
  → POST /mappings/location-shop          { locationId, shopId }
  ← mapping créé
```

#### 2b. Assignation d'un shop à un étage (floor assignment)

```
Utilisateur ouvre le dialog "Assigner un étage"
  → Sélectionne sa configuration (ex. "Stade de Pau")
  → Sélectionne un étage (ex. RDC — level 0)
  → Clique "Appliquer"

  Côté backend :
  → POST /spaces/:spaceId/assign-floor    { elementIds: [shopId], level: 0 }
  ← { level, floorId, floorName }   ← appartient à "Weezevent Import", PAS à "Stade de Pau"

  Côté frontend (écriture dans la config utilisateur) :
  → GET  /configurations/:userConfigId    (lit "Stade de Pau")
  → PUT  /configurations/:userConfigId    (écrit le shop dans le floor niveau 0 de "Stade de Pau")
```

> ⚠️ **Point critique** : `assignResult.floorId` et `assignResult.floorName` retournés par `assign-floor` appartiennent à la configuration **"Weezevent Import"** créée par le backend — pas à la configuration de l'utilisateur. Le frontend n'utilise PAS ces valeurs pour écrire dans la config utilisateur. Voir section 4.

---

## 3. La configuration "Weezevent Import" — comportement observé

### 3.1 Ce que le frontend observe

Après l'appel à `POST /spaces/:id/quick-element` (création d'un shop), une configuration nommée **"Weezevent Import"** apparaît automatiquement dans `GET /spaces/:id/configurations`.

Elle **n'est pas créée par l'utilisateur**. Elle est créée par le backend.

Après l'appel à `POST /spaces/:id/assign-floor`, un **étage nommé "import"** apparaît dans cette configuration, et le shop y est positionné aux coordonnées **X:0, Y:0**.

### 3.2 Ce que fait le frontend pour la masquer

Le frontend filtre cette configuration par son nom dans le sélecteur de la dialog d'assignation :

```js
// StepMapShops.vue
floorDialogConfigOptions() {
  return this.floorDialogConfigs
    .filter(c => c.name?.toLowerCase() !== 'weezevent import')
    .map(c => ({ title: c.name, value: c.id }))
}
```

Ce filtrage par **nom** est fragile. Si le nom de la config backend change, ou si un utilisateur nomme sa propre configuration "Weezevent Import", le filtrage dysfonctionnerait.

### 3.3 Schéma de ce qui coexiste après l'étape 2

```
Space "Stade de Pau"
├── Configuration "Stade de Pau"          ← créée par l'utilisateur (étape 1)
│   └── Floor "RDC" (level: 0)
│       └── Element "shop-abc123"  x:31 y:34  ← placé par le FRONTEND
│
└── Configuration "Weezevent Import"      ← créée automatiquement par le BACKEND
    └── Floor "import" (level: ?)
        └── Element "abc123"       x:0  y:0   ← placé par le BACKEND
```

---

## 4. Bug critique identifié — `assign-floor` et positionnement dans la config utilisateur

### 4.1 Description du bug

Lors de l'assignation d'un shop à un floor, le frontend appelle `POST /spaces/:id/assign-floor`, puis tente de positionner le shop dans la **configuration utilisateur** (ex. "Stade de Pau") via un `PUT /configurations/:id`.

L'ancien code du frontend utilisait `assignResult.level` (retourné par le backend) pour retrouver le bon floor dans la config utilisateur :

```js
// AVANT — code incorrect
const level = assignResult?.level  // ← level issu de "Weezevent Import", potentiellement "import" ou null
area = floors.find(f => f.level === level)  // ← échoue si le level ne correspond pas
```

Si `assignResult.level` retourne une valeur différente de celle sélectionnée par l'utilisateur (par exemple `"import"`, `null`, ou un autre type), la recherche du floor dans la config utilisateur **échoue**, et le code crée un nouveau floor avec le nom `assignResult.floorName` (soit `"import"`), résultant en :

- Un floor inattendu nommé `"import"` dans la config utilisateur "Stade de Pau"
- Le shop positionné dans ce mauvais floor, ou pas du tout positionné

### 4.2 Correction appliquée côté frontend

```js
// APRÈS — code corrigé
const level = this.floorDialogLevel  // ← level choisi par l'utilisateur dans l'interface
area = floors.find(f => f.level === level)  // ← cherche le bon floor dans "Stade de Pau"
```

La correction utilise le level sélectionné par l'utilisateur (`this.floorDialogLevel`) plutôt que le level retourné par le backend.

### 4.3 Ce que nous avons besoin de confirmer

Pour que cette correction soit robuste, nous avons besoin de savoir :

**Question A** : Quel est le format exact de `assignResult.level` retourné par `POST /spaces/:id/assign-floor` ?

- Est-ce un `number` (ex. `0`) ?
- Est-ce une `string` (ex. `"0"` ou `"import"`) ?
- Est-ce la même valeur que celle envoyée dans le body (`level: 0` → réponse `level: 0`) ?

**Question B** : Le floor nommé `"import"` dans "Weezevent Import" — quel `level` a-t-il dans la base de données ?

```json
// Exemple de réponse attendue que nous voulons confirmer :
{
  "level": 0,          // ← number, identique à l'input
  "floorId": "uuid",   // ← floor dans "Weezevent Import", pas dans "Stade de Pau"
  "floorName": "import"
}
```

---

## 5. Endpoint `quick-element` — discordance d'URL

### Ce que le frontend appelle

```
POST /spaces/{spaceId}/quick-element
Body: { name: string, type: string }
```

### Ce que l'OpenAPI documente

```
POST /configurations/{id}/quick-element
Paramètre {id} décrit comme : "ID de l'espace"
```

Il y a une **incohérence** : l'URL du frontend utilise la ressource `spaces`, l'OpenAPI documente `configurations`. Le paramètre `{id}` est décrit comme "ID de l'espace" dans les deux cas.

### Questions

1. L'URL réelle côté backend est-elle `/spaces/{id}/quick-element` ou `/configurations/{id}/quick-element` ?
2. Si c'est `/configurations/{id}`, l'`{id}` est-il l'ID d'une configuration ou d'un espace ?
3. Quelle configuration le backend choisit-il pour y créer le `SpaceElement` ? Est-ce toujours "Weezevent Import" ?

---

## 6. Endpoint `assign-floor` — non documenté

Le frontend utilise un endpoint **absent de l'OpenAPI** :

```
POST /spaces/{spaceId}/assign-floor
```

### Contrat d'appel (côté frontend)

```json
{
  "elementIds": ["uuid-shop-1", "uuid-shop-2"],
  "level": 0
}
```

Le champ `level` accepte :
- Un entier (`0`, `1`, `-1`, ...) pour un floor ou un basement
- La string `"forecourt"` pour la zone Forecourt
- La string `"externalmerch"` pour la zone External Merch

### Comportement supposé (à confirmer)

1. Le backend crée ou réutilise la configuration **"Weezevent Import"** pour le space
2. Il crée un floor nommé `"import"` (level à confirmer) dans cette config
3. Il rattache les `SpaceElement` (`elementIds`) à ce floor
4. Il positionne les éléments à X:0, Y:0 dans la config "Weezevent Import"
5. Il retourne `{ level, floorId, floorName }` décrivant ce floor dans "Weezevent Import"

### Réponse observée

```json
{
  "level": "???",       // ← à confirmer : 0, "import", ou autre ?
  "floorId": "uuid",    // ← ID du floor dans "Weezevent Import"
  "floorName": "import" // ← nom du floor dans "Weezevent Import"
}
```

### Demandes

1. Documenter cet endpoint dans l'OpenAPI
2. Préciser le contrat de réponse complet (types inclus)
3. Confirmer que `level` dans la réponse est **identique** à `level` dans la requête

---

## 7. Coexistence de deux configurations par Space

Un Space issu du wizard contient systématiquement **deux configurations** :

| | Configuration utilisateur | Configuration "Weezevent Import" |
|---|---|---|
| **Créée par** | L'utilisateur à l'étape 1 | Le backend automatiquement à l'étape 2 |
| **Nom** | Choisi par l'utilisateur (ex. "Stade de Pau") | Toujours `"Weezevent Import"` |
| **Rôle** | Plan 3D visuel — floors, zones, positions | Tracking interne Weezevent → floors |
| **Visible dans le 3D builder** | Oui | Oui ← **problème** |
| **Positions des shops** | Définies par l'utilisateur (ex. X:31, Y:34) | Toujours X:0, Y:0 |
| **Nom du floor** | Défini par l'utilisateur (ex. "RDC") | Toujours `"import"` |

### Problème utilisateur

La configuration "Weezevent Import" est **visible dans le 3D builder** aux côtés de la configuration utilisateur. L'utilisateur voit donc ses shops positionnés à X:0, Y:0 dans un floor nommé "import", ce qui est source de confusion.

### Solution demandée

Ajouter un champ `isSystem: boolean` (ou `isInternal`, `isHidden`) sur le modèle `Configuration` afin que le frontend puisse filtrer de manière fiable :

```json
// Réponse GET /spaces/:id/configurations
[
  {
    "id": "uuid-1",
    "name": "Stade de Pau",
    "isSystem": false   ← config utilisateur, à afficher
  },
  {
    "id": "uuid-2",
    "name": "Weezevent Import",
    "isSystem": true    ← config interne, à masquer côté frontend
  }
]
```

Sans ce champ, le filtrage actuel par `name.toLowerCase() === "weezevent import"` restera fragile.

---

## 8. Récapitulatif des demandes au backend

| # | Demande | Impact | Priorité |
|---|---|---|---|
| **B1** | Confirmer le contrat exact de réponse de `POST /spaces/:id/assign-floor` — en particulier le type et la valeur de `level` | Bloquant pour le positionnement correct des shops dans la config utilisateur | 🔴 Haute |
| **B2** | Documenter `POST /spaces/:id/assign-floor` dans l'OpenAPI (body, réponse, comportements) | Fiabilité de l'intégration | 🔴 Haute |
| **B3** | Confirmer l'URL correcte de `quick-element` : `/spaces/{id}/quick-element` ou `/configurations/{id}/quick-element` ? | Cohérence documentation / implémentation | 🔴 Haute |
| **B4** | Confirmer que "Weezevent Import" est bien une configuration interne non destinée à l'utilisateur final | Compréhension de l'architecture | 🔴 Haute |
| **B5** | Ajouter un flag `isSystem: boolean` sur le modèle `Configuration` | Éliminer le filtrage par nom fragile · Empêcher la confusion dans le 3D builder | 🟠 Moyenne |
| **B6** | Confirmer que `assign-floor` positionne les shops à X:0, Y:0 dans "Weezevent Import" — est-ce intentionnel ? | Comprendre si le backend gère la position ou si c'est uniquement le frontend | 🟡 Faible |

---

## Annexe — Historique des problèmes rencontrés

### A1. Shops visibles dans "Weezevent Import" et non dans la config utilisateur (résolu côté frontend)

**Symptôme** : Après assignation à un floor, le shop apparaissait dans "Weezevent Import" à X:0, Y:0 mais pas dans la configuration de l'utilisateur.

**Cause** : Le frontend utilisait `assignResult.level` (valeur retournée par le backend, propre à "Weezevent Import") pour retrouver le floor dans la config utilisateur. Si cette valeur ne correspondait pas au level sélectionné, la recherche échouait et un mauvais floor était créé.

**Correction** : Utilisation de `this.floorDialogLevel` (valeur sélectionnée par l'utilisateur dans l'interface) à la place de `assignResult.level`. Le frontend ne dépend plus de la valeur retournée par le backend pour localiser le floor dans la config utilisateur.

### A2. Collision de noms entre config utilisateur et "Weezevent Import" (résolu côté frontend)

**Symptôme** : Si l'utilisateur nommait sa configuration `"weezevent import"`, elle était filtrée du sélecteur et devenait inaccessible.

**Correction** : La valeur par défaut du champ "nom de configuration" a été modifiée pour ne plus proposer `"weezevent import"`. La résolution pérenne reste le flag `isSystem` côté backend (demande B5).

### A3. Shop mappé à l'étage "import" dans la config utilisateur

**Symptôme** : Un floor nommé `"import"` apparaissait dans la configuration utilisateur ("Stade de Pau") au lieu du floor attendu ("RDC").

**Cause** : Le frontend utilisait `assignResult.floorName` (soit `"import"`) comme nom du floor à créer dans la config utilisateur quand aucun floor existant ne correspondait au level.

**Correction** : Utilisation d'un nom calculé côté frontend (`"RDC"`, `"Étage 1"`, `"Sous-sol 1"`, etc.) indépendant du `floorName` retourné par le backend.

---

*Document rédigé le 2026-06-26 — Équipe Frontend DataFriday*  
*Ce document sera mis à jour au fil des réponses de l'équipe backend.*
