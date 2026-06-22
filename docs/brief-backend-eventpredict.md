# Brief BACKEND (NestJS/Prisma) — Event Predict

À implémenter dans l'API (`datafriday-api`). Le front est prêt et bascule dessus
en changeant un seul flag dès que c'est en prod. Stack supposée : NestJS +
Prisma + Postgres, JWT (tenant dans le token), préfixe global `/api/v1`.

---

## 1. Migration Prisma

Le modèle `EventPredictVersion` **existe déjà** (table OK pour events passés ET
futurs : `eventId` est un `String` sans relation → aucune contrainte). Ajouter
**1 champ** (le front l'envoie déjà, sinon perdu au round-trip) :

```prisma
model EventPredictVersion {
  // … champs existants …
  selectedTimeRange  Json?     // { start: string|null, end: string|null } | null
}
```
Optionnel (figer coût/marge ; sinon recalculés côté front) :
```prisma
  totalCost          Float     @default(0)
  adjustedTotalCost  Float     @default(0)
```
Puis `prisma migrate dev --name event_predict_version_time_range`.

---

## 2. Endpoints à exposer

Tous **scopés tenant** (depuis le JWT) + guard auth habituel. **404** si
introuvable (défaut NestJS — ne PAS ajouter de catch-all qui renvoie 200, le
front interprète un 200 sur route inconnue comme un faux succès).

| Méthode | Route | Body | Retour |
|---|---|---|---|
| GET | `/events/:eventId/predict-versions` | — | `EventPredictVersion[]` |
| POST | `/events/:eventId/predict-versions` | `CreateDto` | `EventPredictVersion` (201) |
| PATCH | `/predict-versions/:id` | `Partial<CreateDto>` | `EventPredictVersion` |
| DELETE | `/predict-versions/:id` | — | 204 |
| PUT | `/events/:eventId/predict-versions/default` | `{ versionId: string \| null }` | `{ defaultVersionId: string \| null }` |

### DTO

```ts
class CreateEventPredictVersionDto {
  @IsString() name: string;
  @IsOptional() @IsString() spaceId?: string;
  @IsObject() eventSnapshot: Record<string, any>;
  @IsOptional() @IsNumber() totalRevenue?: number;
  @IsOptional() @IsNumber() adjustedTotalRevenue?: number;
  @IsOptional() @IsNumber() perCapita?: number;
  @IsOptional() @IsNumber() adjustedPerCapita?: number;
  @IsOptional() @IsObject() menuConfig?: Record<string, string[]>;
  @IsOptional() @IsObject() quantityAdjustments?: Record<string, number>;
  @IsOptional() @IsArray() selectedPredictionEventIds?: string[];
  @IsOptional() @IsObject() selectedTimeRange?: { start: string|null; end: string|null } | null;
}
```
`whitelist: true` OK (champs ci-dessus = tout ce que le front envoie).

### Service — points clés

```ts
// LIST
list(tenantId, eventId) =>
  prisma.eventPredictVersion.findMany({ where: { tenantId, eventId }, orderBy: { createdAt: 'asc' } })

// CREATE
create(tenantId, eventId, dto, userId) =>
  prisma.eventPredictVersion.create({
    data: { ...dto, eventId, tenantId, isDefault: false, createdBy: userId },
  })

// UPDATE — vérifier que la version appartient au tenant avant
update(tenantId, id, dto) => prisma.eventPredictVersion.update({ where: { id /* + check tenant */ }, data: dto })

// DELETE
remove(tenantId, id) => prisma.eventPredictVersion.delete({ where: { id /* + check tenant */ } })

// SET DEFAULT — EXCLUSIF, en transaction
setDefault(tenantId, eventId, versionId | null) =>
  prisma.$transaction([
    prisma.eventPredictVersion.updateMany({ where: { tenantId, eventId }, data: { isDefault: false } }),
    ...(versionId ? [prisma.eventPredictVersion.update({ where: { id: versionId }, data: { isDefault: true } })] : []),
  ])
  // retourne { defaultVersionId: versionId | null }
```

Règles :
- **`isDefault` exclusif par event** : un seul `true` à la fois (d'où le reset
  `updateMany` puis set unique, en transaction).
- **Pas de gestion "version active"** côté backend — c'est de l'état UI
  (localStorage front uniquement).
- Vérifier l'appartenance tenant sur PATCH/DELETE (sinon 403/404).
- `createdBy` = user du JWT.

---

## 3. Prix & coûts — vérifier l'existant (pas de nouvelle route)

Le front calcule prix/coût/marge via cette chaîne. S'assurer que ces endpoints
existants renvoient bien les données :

1. **`GET /weezevent/products`** → chaque produit doit exposer **`basePrice`**
   (numérique, non nul) + `id`. Le `id` doit correspondre au `weezeventProductId`
   présent dans la timeline. Si l'endpoint exige un `integrationId` pour
   renvoyer les produits → le signaler (le front l'ajoutera).
2. **`GET /mappings/product-menu`** → renvoie les liens
   `{ weezeventProductId, menuItemId }` du tenant. Confirmer le param attendu si
   ce n'est pas implicite via le token.
3. **`MenuItem.totalCost`** doit être **renseigné** = somme
   `MenuItemComponent` + `MenuItemIngredient` + `MenuItemPackaging`. Idéalement
   recalculé/persisté côté backend à chaque modif de fiche. S'il est `null`/0 →
   pas de coût → marge ~100 % côté front.
4. **`GET /spaces/:spaceId/event-timeline/:eventId`** doit continuer à inclure
   **`weezeventProductId`** sur chaque ligne (clé de jointure prix/coût). Vérifier
   que la RPC/jointure ne le drope pas.

---

## 4. Checklist livraison

- [ ] Migration `selectedTimeRange` (+ coûts optionnels) appliquée.
- [ ] Module `EventPredictVersion` : controller + service + DTO.
- [ ] 5 routes (§2), scopées tenant, 404 sur introuvable.
- [ ] `setDefault` exclusif en transaction.
- [ ] `/weezevent/products` renvoie `basePrice`.
- [ ] `/mappings/product-menu` renvoie `{weezeventProductId, menuItemId}`.
- [ ] `MenuItem.totalCost` renseigné.
- [ ] `event-timeline` expose `weezeventProductId`.

Quand 1–5 sont en prod → côté front on passe `REST_ENABLED = true`
(`src/composables/useEventPredictVersions.js`) et la persistance bascule
localStorage → BDD sans autre changement. Contrat REST détaillé :
`docs/eventPredictVersions.api.md`.
