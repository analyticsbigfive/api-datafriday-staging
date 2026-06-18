# Carte des données manquantes — Écran Analyse + Module Inventory

Audit transversal de tous les widgets / charts / tables / filtres de `AnalyseView.vue`, croisé avec le contrat de données (`STATISTIQUES_REFERENCE.md`, `WEEZEVENT_ANALYTICS_GAPS.md`), **complété par le diagnostic des endpoints API manquants côté Inventory**.

- **Période d'audit :** juin 2026
- **Périmètre :** 45 widgets / filtres (Analyse) + 5 routes API (Inventory)
- **Destinataire :** équipe backend

L'écran Analyse rend correctement tous ses widgets, mais une grande partie affiche du vide ou des agrégats dégradés (bucket « — », 0, donut vide) parce que les champs source ne sont pas peuplés en amont. Les causes sont presque exclusivement des lacunes d'intégration / configuration (wizard Steps 2/3/5, sync attendees, absence d'events N-1), **pas** des bugs frontend — le seul bug code identifié (Shop Performance txn/min) est déjà corrigé côté front (`aliasToPrimary` sur `useShopPerformance.js`).

Le **module Inventory** ajoute une seconde catégorie de manques : des routes API **inexistantes** côté NestJS (404, pas 401), traitées en §04.

**Légende état :** OK fonctionne nativement · Conditionnel dépend d'une config / d'un panel · Vide / manquant champ source non peuplé · 404 route absente côté backend

---

## 01 — Carte complète (Écran Analyse)

### KPI

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| KPI CA / CA MOY / Coût / Transac. / Panier | CA, CA moyen, coût, transactions, panier | `r.revenue`, `r.transactionCount`, `r.quantity`, `r.eventId` | OK | Champs natifs peuplés dès G1/G2 + sync transactions (alias `revenue←revenueHt`) | Aucune |
| KPI % MARGE + carte marge | Marge % = (revenue−cost)/revenue | `r.revenue`, `r.menuItemId`, `r.quantity`, `menuItemCostMap` | Conditionnel | `menuItemCostMap` vide OU `menuItemId` = fallback `weezeventProductId` non rattaché aux clés du costMap → cost=0 → marge trompeuse à 100% | Step 3 (menu-mapping) + `rebuild-menu-mappings` + `shop-details` renvoie `menuItemCostMap` |
| KPI COÛT MOY + carte coût | Coût matière = Σ `costMap[menuItemId]`×quantity | `r.menuItemId`, `r.quantity`, `menuItemCostMap` | Conditionnel | Idem marge : sans costMap ou avec id de fallback → cost=0 | Step 3 + costMap renvoyé par `shop-details` |
| KPI TAUX TRANSACTION (/min) | transactions/minute | `r.transactionCount`, `operatingMinutes` (timeline), `doorsOpening` | Conditionnel | `operatingMinutes`=0 sans timeline chargée | Step 2 + sync transactions ; ouvrir Shop Performance (`enrich()`) |
| KPI Spectateurs (header) | Σ ticketsScanned/attendees | `e.ticketsScanned`, `e.attendees` | Vide / manquant | Gap G6 : `WeezeventAttendee.scannedAt` non synchronisé → 0 | Sync attendees (webhook scan / wallets via `sync-attendees`) |
| KPI Transfo (header) | conversion = transactions/spectateurs | `r.transactionCount`, `e.ticketsScanned/attendees` | Vide / manquant | Gap G6 : dénominateur=0 → « — » | Sync attendees (G6) |
| KPI Per cap (header) | revenue/spectateur | `r.revenue`, `e.ticketsScanned/attendees` | Vide / manquant | Gap G6 : dénominateur=0 → perCapita=0 | Sync attendees (G6) |
| Chip variation (4 cartes grille + 8 KPI header) | ±X.X% vs baseline | `summary.variations` / `variationsYoY` | Conditionnel | null en single-event mode OU baseline absente ; YoY null sans events N-1 (G9) | ≥2 events sur la période + events historiques N-1 |

### Performance

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| Performance PdV — nom/revenu/unités/rang | top shops par CA | `r.shopName`, `r.revenue`, `r.quantity`, `r.eventId` | OK | shopName peuplé (Step 2) | Aucune |
| Performance PdV — chip txn/min | cadence par shop | `props.shopRates` (timeline) | Conditionnel | Dépend de l'enrichissement timeline (`useShopPerformance.enrich`) | Sync transactions + ouvrir le panel |
| Performance Événements — nom/date/revenu/unités | top events | `props.events`, `r.eventId`, `r.revenue` | OK | eventDate natif Event Data | Vérifier rattachement spaceId |
| Performance Articles — nom/revenu/unités | top articles par CA | `r.menuItemName`, `r.revenue`, `r.eventId` | Vide / manquant | Step 3 absent → menuItemName=null → bucket « — » | Step 3 + `rebuild-menu-mappings` |

### CA par event

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| Vue « Shops » | CA empilé par boutique | `r.shopName`, `r.revenue`, `r.eventDate` | OK | shopName peuplé | Aucune |
| Vue « Menu Types » | CA empilé par type d'article | `r.menuItemType`, `r.revenue` | Vide / manquant | Step 3 absent → menuItemType=null → segment « — » | Step 3 ; optionnel WeezPay `Product.nature` → `originalType` |
| Agrég. Monthly/Quarterly/Yearly | barres par période | `r.eventDate` | Conditionnel | Skip si eventDate non parsable (rare) | Aucune |
| CA cumulé / prédictions | courbe cumulée / confiance | `r.revenue`, `r.isPredictive`, `r.confidenceScore` | Conditionnel | Dépend du mode tri/temporel et de la prédiction | Aucune (natif) |
| GenericByEventChart — métrique Coût | coût par event | `record.menuItemId`, `record.quantity`, `costMap` | Conditionnel | costMap vide / menuItemId non mappé → 0 | Step 3 + costMap |
| GenericByEventChart — Participants/PerCap/TransferRate | par event | `e.ticketsScanned/attendees/ticketsSold` | Vide / manquant | Gap G6 (+G3 ticketsSold) → 0 | Sync attendees (G6) ; WeezTicket ticketsSold (G3) |

### POS Distribution

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| « By shop » / « By type » | répartition CA/qté par shop/type | `r.shopName`, `r.shopType`, `r.revenue`, `r.quantity` | OK | shopName + shopType (Step 2 + quick-create originalType) | Vérifier `attributes.originalType` non nul |
| « By area » + sous-titre | répartition par zone | `r.shopArea` | Vide / manquant | Gap G4 : `SpaceElement.attributes.area` JAMAIS rempli | Champ « Zone » dans `StepMapShops.vue` + `PropertiesPanelView.vue` (backend prêt) |

### Menu Distribution

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| Carte FOOD | CA catégorie FOOD (heuristique type) | `r.menuItemType` | Vide / manquant | Step 3 absent → menuItemType vide → 0 | Step 3 |
| Carte BEER | CA catégorie BEER (heuristique catégorie) | `r.menuItemCategory` | Vide / manquant | Step 3 absent → menuItemCategory vide → 0 | Step 3 |
| Carte BEVERAGE | CA catégorie BEVERAGE (else fourre-tout) | `r.menuItemType`, `r.menuItemCategory` | Conditionnel | Branche « else » : si type+cat vides, TOUT le CA tombe ici (trompeur) | Step 3 |
| Donuts items/types/catégories | répartition par item/type/cat | `r.menuItemName`, `r.menuItemType`, `r.menuItemCategory` | Vide / manquant | Step 3 absent → groupBy skip les clés vides | Step 3 + `rebuild-menu-mappings` |

### Menu Items by Shop

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| Vue PdV | table par PdV | `r.shopName`, `r.quantity`, `r.revenue`, `r.eventId` | OK | shopName peuplé | Aucune |
| Colonnes Article/Type/Catégorie | table par article | `r.menuItemName/Type/Category` | Vide / manquant | Step 3 absent → colonnes vides | Step 3 |
| Multi-select Types/Catégories | options de filtre | `r.menuItemType/Category` | Vide / manquant | Step 3 absent → `filter(Boolean)` → liste vide | Step 3 |
| Vignette article | image article | `r.menuItemPicture` | Vide / manquant | Champ rarement peuplé → fallback icône | Importer visuels (optionnel) |
| Export Excel | xlsx PdV/Article/Type/Cat/Qté/CA | mixte | Conditionnel | Colonnes `menuItem*` vides sans Step 3 | Step 3 |

### Shop Performance

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| nom/CA/Avg/events/total transactions | par shop | `r.shopName`, `r.revenue`, `r.transactionCount`, `r.eventId` | OK | Champs granulaires peuplés | Aucune |
| txn/min, First Hour, Peak, Operating Minutes | métriques timeline | timeline (`r.minute`, `r.transactionCount`), `doorsOpening` | Conditionnel | Bug clé shopId vs shopName **déjà corrigé** ; reste : timeline doit renvoyer des données + doorsOpening (Step 5) | Vérifier `getSpaceEventTimeline` ; doorsOpening Step 5 |

### Event Timeline

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| Courbe revenue/quantity + axes/tooltip | aires minute/minute | `r.totalRevenue`, `r.totalQuantity`, `r.minute` | OK | preprocessing timeline natif | Sync transactions |
| Breakdown « Par shop » | séries par shop | `r.shopId`, `r.shopName` | OK | shopId/shopName peuplés | Aucune |
| Breakdown « Par item » | séries par article | `r.mappedMenuItemId`, `r.menuItemId`, `r.itemName` | Vide / manquant | Step 3 absent → ids non résolus → « Unknown » | Step 3 |

### Filtres

| Widget | Donnée affichée | Champ(s) source | État | Cause racine | Remédiation |
|---|---|---|---|---|---|
| Événements / Dates / Config / Billets vendus | sélecteurs events & période | `props.events`, `e.date`, `e.ticketsSold/attendees` | OK | Natifs | Aucune |
| Types de PdV / Shops | options shop/type | `r.shopName`, `r.shopType` | OK | Step 2 + originalType | Aucune |
| Zones | options de zone | `r.shopArea` | Vide / manquant | Gap G4 : shopArea vide → filtre mort | Gap G4 (champ Zone) |
| Articles / Type article / Catégorie article | options menu | `r.menuItemName/Type/Category` | Vide / manquant | Step 3 absent → options vides | Step 3 |
| Billets scannés (slider) | scannés | `e.ticketsScanned` | Vide / manquant | Gap G6 : ticketsScanned vide | Sync attendees (G6) |
| Avancés — Catégorie/Type d'événement | multi-select | `e.category`, `e.eventType` | Conditionnel | Gap G3 : null tant que non saisi au Step 5 | Step 5 (Event Details) |
| Avancés — Équipe/Équipe visiteur/Performer/Opening act/Sponsor | multi-select sport/spectacle | `e.team`, `e.visitingTeam`, `e.performer`, `e.openingAct`, `e.sponsor` | Vide / manquant | Gap G3 : non saisis (team/visitingTeam via Step 5 ; performer/sponsor non câblés) | Step 5 ; enrichir performer/sponsor |
| Avancés — Ouverture portes / Heure show | multi-select horaires | `e.doorsOpening`, `e.showTime` | Conditionnel | Gap G8 résolu via Step 5 : null sans saisie | Step 5 (Event Details) |
| Avancés — Entr'acte / Sous-cat / Sessions | multi-select | `e.hasIntermission`, `e.subcategory`, `e.session` | Vide / manquant | Non saisis (`hasIntermission` absent du formulaire Step 5) | Ajouter `hasIntermission` au Step 5 |
| Configuration (restriction events) | restreint events par config | `configurationId` / `cfg.eventIds` | Conditionnel | Gap G7 : `configurationId` non stocké sur `WeezeventEvent` → ne restreint rien | Assigner `configurationId`/`eventIds` à l'import |
| Comparaisons Précédent / N-1 | variation vs baseline | totaux période courante vs précédente/N-1 | Conditionnel | Gap G9 : pas d'events N-1 → `variationsYoY` vide ; transferRate dépend de G6 | Events historiques N-1 ; sync attendees |

---

## 02 — Groupement par cause racine (Analyse)

**Bug code — Shop Performance txn/min · DÉJÀ corrigé.** Mismatch de clé d'agrégation `shopId` vs `shopName` entre records granulaires et timeline → taux nuls. Résolu côté frontend (`aliasToPrimary` dans `useShopPerformance.js`). Reste à vérifier que `getSpaceEventTimeline(spaceId, eventId)` renvoie des records non vides — sinon `transactionRate`/`operatingMinutes`/First Hour/Peak retombent à 0 par manque de données, pas par bug.

**Wizard Step 3 (mapping produits) — ~14 widgets · cause n°1.** Sans Step 3 (`menu-mapping` + `rebuild-menu-mappings`) : `menuItemName/Type/Category`=null (donuts items/types/catégories, cartes FOOD/BEER, table Menu Items, filtres article/type/catégorie, breakdown timeline « Par item ») ET `menuItemId`=fallback `weezeventProductId` non rattaché aux clés du `menuItemCostMap` → cost=0 → marge=100% trompeuse, KPI Coût/Coût moyen à 0.

**Gap G4 — shopArea jamais renseigné — ~3 widgets · frontend only.** `SpaceElement.attributes.area` n'est alimenté par aucun éditeur. `uniqueShopAreas` toujours `[]`. Touche : POS Distribution donut « By area » + sous-titre, filtre Zones. Levier purement frontend : ajouter un champ « Zone » dans `StepMapShops.vue` (quick-create) et `PropertiesPanelView.vue`. Le backend accepte déjà `attributes.area`.

**Gap G6 — ticketsScanned / ticketsSold — ~7 widgets.** Sync attendees non configurée → KPI Spectateurs/Transfo/Per cap, GenericByEventChart (Participants/PerCap/TransferRate), filtre Billets scannés, variation transferRate. Action : webhook WeezPay « scan » OU import wallets via `syncWeezeventEventAttendees`.

**Step 5 / enrichissement events — ~9 filtres avancés.** `doorsOpening/showTime/category/eventType/team/visitingTeam` saisis manuellement au Step 5 « Event Details » (PATCH `weezevent-events/:eventId` → metadata). `hasIntermission` pas encore dans le formulaire. Alimente aussi le « First Hour rate ».

**Gap G9 — pas d'événements N-1 — comparaisons YoY.** `variationsYoY` vides sans historique. Action : charger des events N-1 ; sélectionner ≥2 events.

**Gap G7 — configurationId non stocké — filtre Configuration.** Le filtre Configuration ne restreint pas réellement les events. Action : assigner `configurationId`/`eventIds` à l'import.

**Ce qui fonctionne nativement (G1/G2 + sync transactions).** KPI CA/CA moyen/Transactions/Panier ; Performance PdV & Événements ; CA par event « Shops » + agrégations temporelles ; POS Distribution « By shop »/« By type » ; Menu Items by Shop vue PdV ; Shop Performance CA/Avg/events/transactions ; Event Timeline (revenue/quantity, « Par shop ») ; filtres Événements/Dates/Config/Shops/Types/Billets vendus.

---

## 03 — Plan d'action priorisé (Analyse)

1. **Wizard Step 3 (menu-mapping) + rebuild-menu-mappings + costMap — priorité absolue.** Débloque ~14 widgets et corrige COÛT/MARGE.
2. **Sync attendees (G6).** Débloque ~7 widgets (Spectateurs/Transfo/Per cap…).
3. **Event Details au Step 5 (+ ajouter `hasIntermission`).** ~9 filtres avancés + First Hour rate.
4. **Champ « Zone » (G4) dans `StepMapShops.vue` et `PropertiesPanelView.vue`.** Seul levier purement frontend — donut « By area » + filtre Zones.
5. **Vérifier la timeline (`getSpaceEventTimeline`).** txn/min, Operating Minutes, Peak, First Hour.
6. **Events historiques N-1 (G9).** Comparaisons année/année.
7. **Vérifier `originalType` (Step 2).** Fiabilise donut « By type » et filtre Types de PdV.
8. **Optionnel/structurel.** `configurationId`/`eventIds` à l'import (G7) ; WeezTicket pour `ticketsSold` (G3) ; enrichir performer/sponsor/subcategory/session.

---

## 04 — Module Inventory — endpoints API manquants (NestJS)

Diagnostic distinct de l'écran Analyse, même backend. Auth OK (`space: Auxerre | events: 11`). Deux problèmes, **non bloquants** pour l'app (fallback localStorage), mais qui empêchent la **persistance serveur** de l'inventaire.

### Bug #1 — `/packaging-types` → mauvais chemin · CORRIGÉ côté front

| Front appelait | Backend réel | Verdict |
|---|---|---|
| `GET /api/v1/packaging-types` | **404** (route inexistante) | mauvais chemin front |
| `GET /api/v1/packaging` | **existe** (probe sans token → 401 ; GET+POST « Lister tous les packagings ») | route cible |

**Fix appliqué :** swap `/packaging-types` → `/packaging` dans `inventory.api.js:53`. Le store accepte `data` ou `data.data`.
**À confirmer backend :** `/packaging` renvoie bien des entrées compatibles « types de packaging » (sinon prévoir un champ/filtre dédié).

### Bug #2 — Module Inventory absent de l'API · ACTION BACKEND REQUISE

Probe live (sans token : 401 = route existe, 404 = manquante) → **toutes 404**, aucune route inventory dans `openapi.json`. Le module **n'est pas implémenté** côté NestJS.

| Route front appelée | État backend | À implémenter |
|---|---|---|
| `GET /api/v1/inventory/:spaceId/:eventId` | 404 | Oui — lire l'inventaire d'un event |
| `GET /api/v1/inventory/:spaceId/latest` | 404 | Oui — dernier inventaire d'un space |
| `POST /api/v1/inventory` | 404 | Oui — créer/upsert un inventaire |
| `POST /api/v1/inventory-counts` | 404 | Oui — enregistrer les comptages |

**Comportement actuel (dégradé, géré) :** `getInventory` catch le 404 → retourne `null` ([`inventory.api.js:15`]) → fallback localStorage. Les comptages marchent en local mais **ne sont pas persistés serveur**. Le `⚠️ Ressource non trouvée` en console = intercepteur qui logue le 404 avant le catch → **cosmétique**.

### Plan d'action — Inventory

1. **Confirmer `/packaging`** renvoie des types compatibles (Bug #1 déjà fixé front).
2. **Implémenter le module Inventory NestJS** (4 routes ci-dessus) + entités + persistance + Swagger (`openapi.json` à jour).
3. **Vérif :** probe sans token sur chaque route → 401 (et non 404) ; recharger page Inventory → `/packaging` 200, plus de 404 sur `/inventory/...`.

> Tant que le module Inventory n'est pas livré, l'inventaire reste **localStorage-only**.

---

*Carte des données manquantes — Écran Analyse + Module Inventory · généré juin 2026 · à destination de l'équipe backend. Les remédiations « Step 2/3/5 » renvoient au wizard d'import Weezevent ; les « Gap Gx » au document `WEEZEVENT_ANALYTICS_GAPS.md`. Le §04 reprend le diagnostic des endpoints Inventory (probe live + `openapi.json`).*
