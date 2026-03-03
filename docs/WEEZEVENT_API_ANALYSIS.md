# Analyse API Weezevent (WeezPay) — Routes utiles pour DataFriday

**Source**: https://docapi.weezevent.com/openapi.html?weezpay

**Objectif**: Identifier les endpoints Weezevent nécessaires pour notre SaaS (gestion événements, ventes, cashless, analytics).

---

## Vue d'ensemble API Weezevent

L'API Weezevent/WeezPay couvre plusieurs domaines :
- **Gestion organisations & événements**
- **Billetterie & participants (attendees)**
- **Commandes & transactions**
- **Produits (food/beverage) & prix**
- **Cashless / Wallets / Top-ups**
- **Paiements & remboursements**
- **Webhooks (notifications temps réel)**
- **Devices (terminaux de paiement/scan)**

---

## 1) Routes **CRITIQUES** (à implémenter en priorité)

### A) **Organizations & Events** (fondation)
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}` | GET | Récupérer infos organisation Weezevent |
| `GET /organizations/{organization_id}/events` | GET | **Lister tous les événements** (sync périodique) |
| `GET /organizations/{organization_id}/events/{event_id}` | GET | **Détails d'un événement** (dates, lieu, statut) |

**Pourquoi critique** :
- Base de toute intégration : sans événements, pas de données.
- À synchroniser **quotidiennement** ou via webhook.

**Stockage** :
- Table `Event` (Prisma) : `weezeventEventId`, `name`, `startDate`, `endDate`, `status`, etc.

---

### B) **Products (Food/Beverage)** — **LE PLUS IMPORTANT POUR NOUS**
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/products` | GET | **Liste produits d'un événement** (menu items vendus) |
| `GET /organizations/{organization_id}/events/{event_id}/products/{product_id}` | GET | Détails produit (nom, prix, catégorie, variants) |
| `GET /organizations/{organization_id}/events/{event_id}/products/{product_id}/variants` | GET | **Variants d'un produit** (tailles, options) |
| `GET /organizations/{organization_id}/events/{event_id}/products/{product_id}/components` | GET | **Composants d'un produit** (ingrédients, sous-produits) |
| `GET /organizations/{organization_id}/events/{event_id}/products/{product_id}/menu-steps` | GET | **Menu steps** (choix personnalisables : sauces, accompagnements) |

**Pourquoi critique** :
- **C'est le cœur de notre SaaS** : on doit mapper les produits Weezevent → nos `MenuItem` + `MenuComponent`.
- Permet de récupérer la structure menu complète (produits + variants + composants).
- **Sync obligatoire** avant chaque événement.

**Stockage** :
- `MenuItem` : lier via `weezeventProductId`
- `MenuComponent` : lier via `weezeventComponentId`
- Créer une table `WeezeventProductSync` pour tracker les mappings.

---

### C) **Orders & Transactions** (ventes réelles)
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/orders` | GET | **Liste des commandes** (ventes par produit) |
| `GET /organizations/{organization_id}/events/{event_id}/orders/{order_id}` | GET | Détails commande (produits vendus, quantités, prix) |
| `GET /organizations/{organization_id}/events/{event_id}/transactions` | GET | **Transactions financières** (paiements, montants) |

**Pourquoi critique** :
- **Analytics & reporting** : CA par produit, par événement, par espace.
- Permet de croiser ventes réelles vs coûts (notre valeur ajoutée).

**Stockage** :
- Table `WeezeventOrder` : `orderId`, `eventId`, `totalAmount`, `createdAt`, `items[]`
- Table `WeezeventTransaction` : `transactionId`, `orderId`, `amount`, `status`

**Fréquence** :
- **Temps réel via webhook** (idéal) ou **sync toutes les 15-30 min** pendant l'événement.

---

### D) **Attendees (Participants)** — optionnel mais utile
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/attendees` | GET | Liste participants (billets vendus) |
| `GET /organizations/{organization_id}/events/{event_id}/attendees/{attendee_id}` | GET | Détails participant |

**Pourquoi utile** :
- Croiser nombre de participants vs ventes F&B.
- Analytics : panier moyen par participant.

**Stockage** :
- Table `WeezeventAttendee` (optionnel, sauf si on veut faire du CRM/segmentation).

---

### E) **Prices** (tarification)
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/prices` | GET | Liste des prix (grilles tarifaires) |
| `GET /organizations/{organization_id}/events/{event_id}/prices` | GET | Prix spécifiques à un événement |

**Pourquoi utile** :
- Récupérer les prix de vente réels (vs nos coûts).
- Calculer marges automatiquement.

**Stockage** :
- Ajouter champ `weezeventPriceId` dans `MenuItem` ou table dédiée `WeezeventPrice`.

---

### F) **Webhooks** (notifications temps réel) — **TRÈS IMPORTANT**
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/webhooks` | GET | Liste webhooks configurés |
| `POST /organizations/{organization_id}/webhooks` | POST | **Créer un webhook** (écouter events) |
| `DELETE /organizations/{organization_id}/webhooks/{webhook_id}` | DELETE | Supprimer webhook |

**Events à écouter** :
- `order.created` : nouvelle commande
- `order.updated` : commande modifiée/annulée
- `transaction.completed` : paiement confirmé
- `product.updated` : produit modifié
- `event.updated` : événement modifié

**Pourquoi critique** :
- **Évite les sync lourdes** : on reçoit les updates en temps réel.
- Essentiel pour analytics live pendant événements.

**Implémentation** :
- Endpoint backend : `POST /api/v1/webhooks/weezevent`
- Valider signature Weezevent (sécurité).
- Stocker events dans une queue (BullMQ) pour traitement async.

---

## 2) Routes **UTILES** (à implémenter en phase 2)

### G) **Cashless / Wallets / Top-ups** (monnaie électronique)
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/wallets` | GET | Liste wallets (portefeuilles cashless) |
| `GET /organizations/{organization_id}/events/{event_id}/topups` | GET | Rechargements cashless |
| `GET /organizations/{organization_id}/events/{event_id}/transactions` | GET | Transactions cashless |

**Pourquoi utile** :
- Si événement utilise cashless, on peut tracker les dépenses par wallet.
- Analytics : montant moyen rechargé, taux de conversion cashless → ventes F&B.

**Stockage** :
- Table `WeezeventWallet` + `WeezeventTopup` (si besoin analytics cashless).

---

### H) **Refunds (Remboursements)**
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/refunds` | GET | Liste remboursements |
| `POST /organizations/{organization_id}/events/{event_id}/refunds` | POST | Créer remboursement |

**Pourquoi utile** :
- Ajuster analytics si produits remboursés.
- Rare, mais important pour exactitude CA.

---

### I) **Tax Receipts (Reçus fiscaux)**
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/taxreceipts` | GET | Liste reçus fiscaux |
| `GET /organizations/{organization_id}/events/{event_id}/taxreceipts/{tax_receipt_id}` | GET | Télécharger PDF reçu |

**Pourquoi utile** :
- Conformité fiscale (si nécessaire pour certains clients).

---

### J) **Devices (Terminaux)**
| Endpoint | Méthode | Utilité |
|----------|---------|---------|
| `GET /organizations/{organization_id}/events/{event_id}/devices` | GET | Liste devices (TPE, scanners) |

**Pourquoi utile** :
- Tracker ventes par terminal/espace (si plusieurs points de vente).
- Analytics : performance par station.

---

## 3) Routes **NON PRIORITAIRES** (ignorer pour l'instant)

- **Payments** (détails techniques paiements) : géré par Weezevent, pas besoin côté SaaS.
- **Menu steps choices** (détails choix personnalisables) : trop granulaire, sauf si on veut reproduire le builder Weezevent.
- **Variants** (détails variants) : utile seulement si on gère les tailles/options dans notre UI.

---

## 4) Plan d'implémentation recommandé

### Phase 1 (MVP intégration Weezevent)
1. **Auth OAuth Weezevent** : obtenir `access_token` + `refresh_token`
2. **Sync événements** : `GET /events` → stocker dans `Event`
3. **Sync produits** : `GET /events/{id}/products` → mapper vers `MenuItem`
4. **Sync commandes** : `GET /events/{id}/orders` → stocker dans `WeezeventOrder`
5. **Webhooks** : créer webhook `order.created` → update analytics temps réel

### Phase 2 (Analytics avancées)
6. **Sync transactions** : détails paiements
7. **Sync attendees** : participants
8. **Sync cashless** : wallets/topups
9. **Sync prices** : grilles tarifaires

### Phase 3 (Features avancées)
10. **Sync components/menu-steps** : structure menu complète
11. **Refunds** : ajustements CA
12. **Devices** : analytics par terminal

---

## 5) Endpoints backend à créer (notre API)

### Intégration Weezevent
- `GET /api/v1/organizations/{orgId}/integrations/weezevent` : config actuelle
- `PATCH /api/v1/organizations/{orgId}/integrations/weezevent` : update config (API key, webhooks)
- `POST /api/v1/weezevent/sync-events` : sync manuelle événements
- `POST /api/v1/weezevent/sync-products/{eventId}` : sync produits d'un événement
- `POST /api/v1/weezevent/sync-orders/{eventId}` : sync commandes
- `POST /api/v1/webhooks/weezevent` : receiver webhooks Weezevent

### Analytics (exploitant données Weezevent)
- `GET /api/v1/analyse/weezevent/sales-by-product` : CA par produit
- `GET /api/v1/analyse/weezevent/sales-by-event` : CA par événement
- `GET /api/v1/analyse/weezevent/margin-analysis` : marges (ventes Weezevent - coûts DataFriday)

---

## 6) Risques & Limitations

### Rate limits Weezevent
- Vérifier limites API (probablement 100-1000 req/min).
- Implémenter retry + backoff.
- Utiliser webhooks pour réduire polling.

### Mapping produits
- **Problème** : produits Weezevent ≠ forcément nos `MenuItem`.
- **Solution** : table de mapping `WeezeventProductMapping` (manual ou auto).

### Données manquantes
- Weezevent ne fournit pas forcément les coûts (normal, c'est billetterie).
- Notre valeur ajoutée = croiser leurs ventes avec nos coûts.

### Sécurité webhooks
- **Valider signature** (HMAC) pour éviter faux webhooks.
- Stocker secret webhook en DB (chiffré).

---

## 7) Résumé : Routes à implémenter (par ordre de priorité)

| Priorité | Endpoint | Fréquence | Stockage |
|----------|----------|-----------|----------|
| **P0** | `GET /events` | Quotidien | `Event` |
| **P0** | `GET /events/{id}/products` | Avant événement | `MenuItem` + mapping |
| **P0** | `GET /events/{id}/orders` | Temps réel (webhook) | `WeezeventOrder` |
| **P0** | `POST /webhooks` (créer) | Une fois | Config |
| **P1** | `GET /events/{id}/transactions` | Temps réel | `WeezeventTransaction` |
| **P1** | `GET /events/{id}/attendees` | Quotidien | `WeezeventAttendee` |
| **P1** | `GET /prices` | Hebdomadaire | `WeezeventPrice` |
| **P2** | `GET /events/{id}/products/{id}/components` | Avant événement | `MenuComponent` mapping |
| **P2** | `GET /events/{id}/wallets` | Quotidien | `WeezeventWallet` |
| **P3** | `GET /events/{id}/refunds` | Quotidien | `WeezeventRefund` |

---

## Conclusion

**Routes critiques** (à faire maintenant) :
- Events
- Products
- Orders
- Webhooks

**Routes utiles** (phase 2) :
- Transactions
- Attendees
- Prices
- Cashless

**Routes optionnelles** (phase 3+) :
- Components/menu-steps
- Refunds
- Tax receipts
- Devices

Notre backend actuel a déjà un module Weezevent + CRON. Il faut maintenant :
1. Vérifier que les routes ci-dessus sont bien appelées.
2. Ajouter les webhooks (si pas déjà fait).
3. Créer les tables de mapping produits Weezevent ↔ MenuItem.
