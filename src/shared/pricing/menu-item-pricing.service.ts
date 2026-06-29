import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Source de vérité UNIQUE du calcul de prix (TTC, HT, taxe, remise) — catalogue
 * menu items ET Data Integration Weezevent.
 *
 * Principe : on n'invente rien. La TVA et la devise viennent de la donnée
 * (article, config tenant, ou produit/prix Weezevent). Si l'info n'existe pas,
 * on renvoie `null` (pas de défaut 20 % ni de devise codée en dur) → le front
 * sait que la valeur est inconnue et décide quoi afficher.
 */
@Injectable()
export class MenuItemPricingService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: unknown, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private round2(value: number) {
    return Math.round((this.toNumber(value) + Number.EPSILON) * 100) / 100;
  }

  /** Dernier taux TVA tenant (TenantVatConfig) ; `null` si non configuré (pas de 20 par défaut). */
  async getTenantDefaultVatRate(tenantId: string): Promise<number | null> {
    const cfg = await this.prisma.tenantVatConfig.findFirst({
      where: { tenantId },
      orderBy: { effectiveFrom: 'desc' },
      select: { defaultVatRate: true },
    });
    if (!cfg) return null;
    const n = Number(cfg.defaultVatRate);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Décomposition de prix dénormalisée. `basePrice` = TTC brut.
   * Taux résolu : `item.vatRate` → `vatFallback` → `null` (HT/TVA alors `null`).
   * `currency` vient de l'appelant (donnée réelle) → `null` si inconnue.
   * TVA assise sur le net (après remise, règle FR).
   */
  computePricing(item: any, vatFallback: number | null, currency: string | null = null) {
    const basePrice = this.toNumber(item?.basePrice, 0); // TTC brut
    const resolved = item?.vatRate != null ? this.toNumber(item.vatRate) : vatFallback;
    const hasVat = resolved != null && Number.isFinite(resolved);
    const vatRate = hasVat ? (resolved as number) : null;
    const divisor = hasVat ? 1 + (vatRate as number) / 100 : 1;

    const grossTtc = this.round2(basePrice);
    const grossHt = hasVat ? this.round2(basePrice / divisor) : null;
    const grossVat = hasVat ? this.round2(grossTtc - (grossHt as number)) : null;

    const discountType: 'percent' | 'amount' | null =
      item?.discountType === 'percent' || item?.discountType === 'amount'
        ? item.discountType
        : null;
    const discountValue = this.toNumber(item?.discountValue, 0);
    let discountTtc = 0;
    if (discountType === 'percent') discountTtc = this.round2((basePrice * discountValue) / 100);
    else if (discountType === 'amount') discountTtc = this.round2(discountValue);
    discountTtc = Math.min(Math.max(discountTtc, 0), grossTtc); // clamp 0..TTC

    const netTtc = this.round2(grossTtc - discountTtc);
    const netHt = hasVat ? this.round2(netTtc / divisor) : null;
    const netVat = hasVat ? this.round2(netTtc - (netHt as number)) : null;

    // Pas de base de coût (ex. produit Weezevent) ou pas de TVA → cost/margin = null.
    const hasCost = item?.totalCost != null;
    const cost = this.toNumber(item?.totalCost, 0);
    const margin =
      hasCost && hasVat && (netHt as number) > 0
        ? this.round2((((netHt as number) - cost) / (netHt as number)) * 100)
        : null;

    return {
      currency: currency ?? null,
      vatRate,
      discount: { type: discountType, value: discountType ? discountValue : 0 },
      gross: { ttc: grossTtc, ht: grossHt, vat: grossVat },
      net: { ttc: netTtc, ht: netHt, vat: netVat },
      discountAmount: {
        ttc: this.round2(grossTtc - netTtc),
        ht: hasVat ? this.round2((grossHt as number) - (netHt as number)) : null,
        vat: hasVat ? this.round2((grossVat as number) - (netVat as number)) : null,
      },
      cost: hasCost ? this.round2(cost) : null,
      margin,
    };
  }

  /** Renvoie une copie de l'item enrichie de `pricing` (no-op si null). */
  withPricing<T extends Record<string, any>>(
    item: T | null | undefined,
    vatFallback: number | null,
    currency: string | null = null,
  ) {
    if (!item) return item ?? null;
    return { ...item, pricing: this.computePricing(item, vatFallback, currency) };
  }

  /**
   * Décompose chaque prix par espace (`spacePrices` = override TTC par spaceId) avec
   * le même vatRate / remise que l'article. Renvoie `{ [spaceId]: pricing }` ou null.
   */
  computeSpacePricing(item: any, vatFallback: number | null, currency: string | null = null) {
    const sp = item?.spacePrices;
    if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return null;
    const out: Record<string, ReturnType<MenuItemPricingService['computePricing']>> = {};
    for (const [spaceId, raw] of Object.entries(sp)) {
      const price = Number(raw);
      if (!Number.isFinite(price)) continue;
      out[spaceId] = this.computePricing({ ...item, basePrice: price }, vatFallback, currency);
    }
    return Object.keys(out).length ? out : null;
  }

  // ── Weezevent / Data Integration ────────────────────────────────────────────

  /** Devise réelle d'un produit Weezevent via ses prix configurés (WeezeventPrice.currency). */
  private resolveProductCurrency(product: any): string | null {
    const prices = product?.prices;
    if (Array.isArray(prices)) {
      const withCur = prices.find((p: any) => p?.currency);
      if (withCur) return withCur.currency as string;
    }
    return null;
  }

  /**
   * Agrégats de ventes réelles par produit (depuis WeezeventTransactionItem).
   * `opts.integrationId` / `opts.fromDate` / `opts.toDate` scopent l'agrégat : ils
   * activent l'index `[tenantId, integrationId, transactionDate]` de WeezeventTransaction
   * au lieu d'un seq scan sur tout l'historique (~12 s → quelques ms par intégration).
   * ⚠️ N'utiliser `integrationId` que si les `productIds` appartiennent tous à cette
   * intégration (sinon les ventes des autres intégrations sont exclues à tort).
   */
  private async weezeventSalesByProduct(
    tenantId: string,
    productIds: string[],
    opts: { integrationId?: string; fromDate?: Date; toDate?: Date } = {},
  ) {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return new Map<string, any>();
    const conds: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
      Prisma.sql`ti."productId" IN (${Prisma.join(ids)})`,
    ];
    if (opts.integrationId) conds.push(Prisma.sql`t."integrationId" = ${opts.integrationId}`);
    if (opts.fromDate) conds.push(Prisma.sql`t."transactionDate" >= ${opts.fromDate}`);
    if (opts.toDate) conds.push(Prisma.sql`t."transactionDate" <= ${opts.toDate}`);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ti."productId" AS "productId",
        SUM(ti."quantity")::float8                                              AS qty,
        SUM(ti."unitPrice" * ti."quantity")::float8                             AS gross_ttc,
        SUM(ti."unitPrice" * ti."quantity" / (1 + ti."vat" / 100.0))::float8    AS gross_ht,
        SUM(ti."reduction")::float8                                             AS reduction_ttc,
        SUM((ti."unitPrice" * ti."quantity" - ti."reduction")
            / (1 + ti."vat" / 100.0))::float8                                   AS net_ht
      FROM "WeezeventTransactionItem" ti
      JOIN "WeezeventTransaction" t ON t."id" = ti."transactionId"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY ti."productId"
    `);
    return new Map(rows.map((r) => [r.productId, r]));
  }

  /** Décomposition du prix RÉELLEMENT ENCAISSÉ (agrégé sur les ventes) d'un produit. */
  private computeSalesPricing(agg: any, currency: string | null) {
    if (!agg) return null;
    const grossTtc = this.round2(agg.gross_ttc);
    const grossHt = this.round2(agg.gross_ht);
    const reductionTtc = this.round2(agg.reduction_ttc);
    const netTtc = this.round2(grossTtc - reductionTtc);
    const netHt = this.round2(agg.net_ht);
    const qty = this.toNumber(agg.qty, 0);
    return {
      currency: currency ?? null,
      quantity: qty,
      gross: { ttc: grossTtc, ht: grossHt, vat: this.round2(grossTtc - grossHt) },
      reduction: { ttc: reductionTtc },
      net: { ttc: netTtc, ht: netHt, vat: this.round2(netTtc - netHt) },
      avgUnitPriceTtc: qty > 0 ? this.round2(grossTtc / qty) : null,
    };
  }

  /**
   * Prix de vente « modal » par produit Weezevent : un point par couple (unitPrice, vat),
   * trié par fréquence DÉCROISSANTE (le premier = prix le plus pratiqué). C'est exactement
   * le prix déjà calculé/affiché à l'étape 3 — on ne parcourt rien de neuf, requête unique
   * indexée (WeezeventTransactionItem_productId_idx, ~20 ms/100 produits), scopée par
   * productId (vérifiés côté tenant par l'appelant ; le raw n'est pas CLS). `unitPrice`
   * Weezevent est TTC → HT = round2(TTC / (1 + vat/100)).
   */
  async getModalSalesPrices(
    productIds: string[],
  ): Promise<Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>> {
    const out = new Map<string, Array<{ ttc: number; ht: number | null; vatRate: number | null; salesCount: number }>>();
    const ids = [...new Set(productIds.filter(Boolean))];
    if (ids.length === 0) return out;
    const rows = await this.prisma.$queryRaw<{ productId: string; unitPrice: any; vat: any; n: number }[]>`
      SELECT ti."productId", ti."unitPrice", ti."vat", count(*)::int AS n
      FROM "WeezeventTransactionItem" ti
      WHERE ti."productId" IN (${Prisma.join(ids)}) AND ti."unitPrice" > 0
      GROUP BY ti."productId", ti."unitPrice", ti."vat"
      ORDER BY ti."productId", n DESC
    `;
    for (const r of rows) {
      const ttc = Number(r.unitPrice);
      const vatRate = r.vat != null ? Number(r.vat) : null;
      const ht = vatRate != null ? this.round2(ttc / (1 + vatRate / 100)) : null;
      const list = out.get(r.productId) ?? [];
      list.push({ ttc, ht, vatRate, salesCount: Number(r.n) });
      out.set(r.productId, list);
    }
    return out;
  }

  /**
   * Prix « catalogue » à appliquer à un menu item depuis un produit Weezevent : on prend
   * d'abord le prix catalogue Weezevent s'il existe (`product.basePrice`), sinon le prix
   * modal dérivé des ventes (cf. `getModalSalesPrices`, identique à l'affichage `getProducts`).
   * Renvoie `null` si on ne sait rien (pas de catalogue ET aucune vente). `vatRate` suit la
   * même logique de repli (article → vente → null), `currency` vient des prix configurés.
   */
  resolveWeezeventApplyPrice(
    product: any,
    modal: Array<{ ttc: number; vatRate: number | null }> | undefined,
  ): { basePrice: number; vatRate: number | null; currency: string | null; source: 'weezevent_catalog' | 'weezevent_sales' } | null {
    const currency = this.resolveProductCurrency(product);
    if (product?.basePrice != null) {
      return {
        basePrice: this.round2(Number(product.basePrice)),
        vatRate: product.vatRate != null ? Number(product.vatRate) : null,
        currency,
        source: 'weezevent_catalog',
      };
    }
    const top = modal?.[0];
    if (top && Number.isFinite(top.ttc)) {
      return {
        basePrice: this.round2(top.ttc),
        vatRate: product?.vatRate != null ? Number(product.vatRate) : top.vatRate,
        currency,
        source: 'weezevent_sales',
      };
    }
    return null;
  }

  /**
   * Enrichit les mappings produit↔menu item de l'étape 3 avec TOUT le prix, le front
   * décide quoi afficher :
   *  - `menuItem.pricing`            → prix catalogue DataFriday (TVA article/tenant)
   *  - `weezeventProduct.pricing`    → prix de RÉFÉRENCE Weezevent (TVA + devise réelles)
   *  - `weezeventProduct.salesPricing` → prix RÉELLEMENT ENCAISSÉ (agrégé sur les ventes)
   *  - `weezeventProduct.prices`     → prix configurés en amont (déjà inclus par l'appelant)
   * Les appelants doivent inclure `weezeventProduct: { include: { prices: true } }`.
   *
   * `opts.includeSales` (défaut `true`) pilote le calcul de `salesPricing`. Cet agrégat
   * (`weezeventSalesByProduct`) est COÛTEUX : un GROUP BY sur tout l'historique
   * `WeezeventTransactionItem` (centaines de milliers de lignes, ~12 s mesurées en staging)
   * sans borne de date ni d'intégration. Le mettre à `false` pour les appelants qui ne lisent
   * que les paires produit↔menuItem (ex. chargement étape 3 Data Integration) : `salesPricing`
   * vaut alors `null` et on évite l'agrégat sur le chemin critique.
   *
   * `opts.integrationId` / `opts.fromDate` / `opts.toDate` (avec `includeSales`) scopent
   * l'agrégat ventes pour le rendre rapide — à ne renseigner que si tous les mappings
   * passés appartiennent à cette intégration (cf. `weezeventSalesByProduct`).
   */
  async enrichMappingsPricing(
    mappings: any[],
    tenantId: string,
    opts: {
      includeSales?: boolean;
      integrationId?: string;
      fromDate?: Date;
      toDate?: Date;
    } = {},
  ) {
    const { includeSales = true, integrationId, fromDate, toDate } = opts;
    const tenantVatRate = await this.getTenantDefaultVatRate(tenantId);
    const salesByProduct = includeSales
      ? await this.weezeventSalesByProduct(
          tenantId,
          mappings
            .map((m) => m.weezeventProductId ?? m.weezeventProduct?.id)
            .filter(Boolean) as string[],
          { integrationId, fromDate, toDate },
        )
      : new Map<string, any>();

    return mappings.map((m) => {
      const product = m.weezeventProduct;
      const currency = this.resolveProductCurrency(product);
      return {
        ...m,
        menuItem: this.withPricing(m.menuItem, tenantVatRate, null),
        weezeventProduct: product
          ? {
              ...product,
              pricing: this.computePricing(product, null, currency),
              salesPricing: includeSales
                ? this.computeSalesPricing(salesByProduct.get(product.id), currency)
                : null,
            }
          : product,
      };
    });
  }
}
