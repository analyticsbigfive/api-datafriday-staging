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

  /** Agrégats de ventes réelles par produit (depuis WeezeventTransactionItem). */
  private async weezeventSalesByProduct(tenantId: string, productIds: string[]) {
    const ids = [...new Set(productIds.filter(Boolean))];
    if (!ids.length) return new Map<string, any>();
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
      WHERE t."tenantId" = ${tenantId} AND ti."productId" IN (${Prisma.join(ids)})
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
   * Enrichit les mappings produit↔menu item de l'étape 3 avec TOUT le prix, le front
   * décide quoi afficher :
   *  - `menuItem.pricing`            → prix catalogue DataFriday (TVA article/tenant)
   *  - `weezeventProduct.pricing`    → prix de RÉFÉRENCE Weezevent (TVA + devise réelles)
   *  - `weezeventProduct.salesPricing` → prix RÉELLEMENT ENCAISSÉ (agrégé sur les ventes)
   *  - `weezeventProduct.prices`     → prix configurés en amont (déjà inclus par l'appelant)
   * Les appelants doivent inclure `weezeventProduct: { include: { prices: true } }`.
   */
  async enrichMappingsPricing(mappings: any[], tenantId: string) {
    const tenantVatRate = await this.getTenantDefaultVatRate(tenantId);
    const productIds = mappings
      .map((m) => m.weezeventProductId ?? m.weezeventProduct?.id)
      .filter(Boolean) as string[];
    const salesByProduct = await this.weezeventSalesByProduct(tenantId, productIds);

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
              salesPricing: this.computeSalesPricing(salesByProduct.get(product.id), currency),
            }
          : product,
      };
    });
  }
}
