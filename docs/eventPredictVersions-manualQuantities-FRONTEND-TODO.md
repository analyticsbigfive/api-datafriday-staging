# Front-end — activer l'envoi de `manualQuantities` (handoff)

> **Pour l'équipe front.** Le backend est **fait et vérifié sur staging** (la base
> actuellement utilisée). Il ne reste qu'**une ligne à dé-commenter côté front**.
> Aucun changement de lecture n'est nécessaire (le mapping `dbToVersion` est déjà en place).

## État backend (fait le 2026-06-25)

`manualQuantities` (map JSON `Record<string, number>`, clé `${elementId}-${menuItemId}`,
valeur = unités absolues entier ≥ 0, défaut `{}`) est désormais :

- **Colonne BDD** `EventPredictVersion.manualQuantities` — `jsonb NOT NULL DEFAULT '{}'`
  (migration appliquée et vérifiée sur la base staging).
- **Accepté en écriture sur les 2 routes réellement utilisées** :
  - `POST /events/:eventId/predict-versions` (création de version)
  - `PATCH /predict-versions/:id` (mise à jour de version)

  > Note : il n'y a **pas** de route `PUT`. Le 2ᵉ chemin de save est bien **PATCH**.
- **Renvoyé en lecture** : `GET /events/:id/predict-versions` inclut le champ.

→ Envoyer `manualQuantities` ne renvoie **plus** de `400 forbidNonWhitelisted`.

## Important : le POST et le PATCH ne se comportent PAS pareil

Il y a **deux chemins de save** côté front, et un seul strippe le champ :

| Chemin | Fonction | `manualQuantities` envoyé ? | À faire |
|---|---|---|---|
| **POST** (créer/dupliquer une version) | `save()` / `duplicate()` → `versionToPayload(base)` | ❌ strippé (ligne commentée) | **dé-commenter la ligne** (ci-dessous) |
| **PATCH** (maj d'une version existante) | `update()` → `updateEventPredictVersion(id, partial)` | ✅ déjà envoyé (`partial = snapshotForVersion()`, contient `manualQuantities`) | **rien** côté front |

> ⚠️ Note importante : sur le chemin **PATCH**, le front envoyait déjà
> `manualQuantities` **avant** l'ajout backend → ça déclenchait un
> `400 forbidNonWhitelisted` sur **chaque** mise à jour de version existante, qui
> retombait silencieusement en **localStorage uniquement**. L'ajout backend (DTO
> Patch + whitelist) a **débloqué tout ce flux** : les updates persistent
> désormais en BDD, sans aucune action front.

## Le seul changement front à faire (chemin POST/duplication)

Fichier : `datafriday-web/src/composables/useEventPredictVersions.js`
Fonction : `versionToPayload`

Dé-commenter la ligne (actuellement commentée, ~ligne 144) :

```js
manualQuantities: v.manualQuantities || {},
```

C'est tout pour le front. La lecture (`dbToVersion`, ~ligne 120), le snapshot
(`snapshotForVersion`, embarque déjà le champ) et la conservation localStorage
sont déjà en place — seule la **création** (POST) le strippait encore.

## Vérification end-to-end (après le dé-commentage)

1. Event réel → onglet **Configuration** → shop **open** → item à prédit 0 → monter
   le slider quantité (ex. 30).
2. **Save** une version (POST) — puis modifier et re-sauver (PATCH) pour couvrir les 2 chemins.
3. `GET /events/:id/predict-versions` → la version renvoie
   `manualQuantities: { "<elementId>-<menuItemId>": 30 }`.
4. Recharger la page → charger la version → le slider 0-vente réaffiche 30
   (et le CA / Stock-up en tiennent compte).

---
*Réf. spec backend d'origine : `eventPredictVersions-manualQuantities-backend 1.md`.*
