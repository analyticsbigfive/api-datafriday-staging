# Guide Analytics - Données Weezevent

## 📊 Vue d'ensemble

Ce guide vous montre comment exploiter les données Weezevent synchronisées pour créer des analytics, rapports et tableaux de bord.

---

## 🎯 Données Disponibles

### Transactions
**Table:** `WeezeventTransaction`

**Données clés:**
- Montant total (`amount`)
- Statut (`status`)
- Date (`transactionDate`)
- Événement (`eventId`)
- Wallet (`walletId`)
- Items vendus (`items`)

### Wallets
**Table:** `WeezeventWallet`

**Données clés:**
- Solde (`balance`)
- Utilisateur (`userId`)
- Groupe wallet (`walletGroupId`)

### Produits
**Table:** `WeezeventProduct`

**Données clés:**
- Prix (`price`)
- Stock (`stock`)
- Catégorie

### Événements
**Table:** `WeezeventEvent`

**Données clés:**
- Dates (`startDate`, `endDate`)
- Lieu (`locationId`)
- Merchant (`merchantId`)

---

## 📈 Cas d'Usage Analytics

### 1. Chiffre d'Affaires par Période

```typescript
// Service
async getRevenuByPeriod(tenantId: string, startDate: Date, endDate: Date) {
  const transactions = await this.prisma.weezeventTransaction.aggregate({
    where: {
      tenantId,
      transactionDate: {
        gte: startDate,
        lte: endDate,
      },
      status: 'V', // Validées uniquement
    },
    _sum: {
      amount: true,
    },
    _count: true,
  });

  return {
    revenue: transactions._sum.amount || 0,
    transactionCount: transactions._count,
    period: { start: startDate, end: endDate },
  };
}
```

**Endpoint:**
```typescript
@Get('analytics/revenue')
async getRevenue(
  @Query('startDate') startDate: string,
  @Query('endDate') endDate: string,
) {
  return this.analyticsService.getRevenueByPeriod(
    tenantId,
    new Date(startDate),
    new Date(endDate),
  );
}
```

**Exemple d'utilisation:**
```bash
curl "https://api.datafriday.com/weezevent/analytics/revenue?startDate=2024-01-01&endDate=2024-12-31"
```

**Résultat:**
```json
{
  "revenue": 125000,
  "transactionCount": 450,
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  }
}
```

---

### 2. Top Produits Vendus

```typescript
async getTopProducts(tenantId: string, limit: number = 10) {
  const products = await this.prisma.weezeventTransactionItem.groupBy({
    by: ['productId'],
    where: {
      transaction: {
        tenantId,
        status: 'V',
      },
    },
    _sum: {
      quantity: true,
      totalPrice: true,
    },
    _count: true,
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: limit,
  });

  // Enrichir avec les détails produits
  const enriched = await Promise.all(
    products.map(async (p) => {
      const product = await this.prisma.weezeventProduct.findUnique({
        where: { weezeventId: p.productId },
      });
      return {
        productId: p.productId,
        productName: product?.name,
        quantitySold: p._sum.quantity,
        revenue: p._sum.totalPrice,
        orderCount: p._count,
      };
    }),
  );

  return enriched;
}
```

**Résultat:**
```json
[
  {
    "productId": "123",
    "productName": "Bière Pression",
    "quantitySold": 1250,
    "revenue": 6250,
    "orderCount": 450
  },
  {
    "productId": "124",
    "productName": "Burger",
    "quantitySold": 890,
    "revenue": 8900,
    "orderCount": 380
  }
]
```

---

### 3. Évolution du CA par Jour

```typescript
async getDailyRevenue(tenantId: string, startDate: Date, endDate: Date) {
  const transactions = await this.prisma.$queryRaw`
    SELECT 
      DATE(transaction_date) as date,
      SUM(amount) as revenue,
      COUNT(*) as transaction_count
    FROM "WeezeventTransaction"
    WHERE tenant_id = ${tenantId}
      AND transaction_date >= ${startDate}
      AND transaction_date <= ${endDate}
      AND status = 'V'
    GROUP BY DATE(transaction_date)
    ORDER BY date ASC
  `;

  return transactions;
}
```

**Résultat:**
```json
[
  {
    "date": "2024-11-01",
    "revenue": 4500,
    "transactionCount": 45
  },
  {
    "date": "2024-11-02",
    "revenue": 5200,
    "transactionCount": 52
  }
]
```

---

### 4. Analyse par Événement

```typescript
async getEventAnalytics(tenantId: string, eventId: string) {
  const [revenue, topProducts, hourlyDistribution] = await Promise.all([
    // CA total
    this.prisma.weezeventTransaction.aggregate({
      where: { tenantId, eventId, status: 'V' },
      _sum: { amount: true },
      _count: true,
      _avg: { amount: true },
    }),

    // Top produits
    this.getTopProductsByEvent(tenantId, eventId, 5),

    // Distribution horaire
    this.getHourlyDistribution(tenantId, eventId),
  ]);

  return {
    eventId,
    revenue: revenue._sum.amount || 0,
    transactionCount: revenue._count,
    averageBasket: revenue._avg.amount || 0,
    topProducts,
    hourlyDistribution,
  };
}
```

---

### 5. Analyse Wallets

```typescript
async getWalletAnalytics(tenantId: string) {
  const stats = await this.prisma.weezeventWallet.aggregate({
    where: { tenantId },
    _sum: { balance: true },
    _avg: { balance: true },
    _count: true,
  });

  const distribution = await this.prisma.$queryRaw`
    SELECT 
      CASE 
        WHEN balance = 0 THEN 'empty'
        WHEN balance > 0 AND balance <= 1000 THEN 'low'
        WHEN balance > 1000 AND balance <= 5000 THEN 'medium'
        ELSE 'high'
      END as range,
      COUNT(*) as count,
      SUM(balance) as total_balance
    FROM "WeezeventWallet"
    WHERE tenant_id = ${tenantId}
    GROUP BY range
  `;

  return {
    totalWallets: stats._count,
    totalBalance: stats._sum.balance || 0,
    averageBalance: stats._avg.balance || 0,
    distribution,
  };
}
```

---

## 📊 Tableaux de Bord Recommandés

### Dashboard Principal

**KPIs:**
- CA du jour / semaine / mois
- Nombre de transactions
- Panier moyen
- Taux de conversion

**Graphiques:**
- Évolution CA (ligne)
- Top produits (barres)
- Distribution horaire (heatmap)
- CA par événement (pie chart)

### Dashboard Produits

**Métriques:**
- Produits les plus vendus
- Revenus par catégorie
- Stock restant
- Taux de rotation

### Dashboard Wallets

**Métriques:**
- Nombre de wallets actifs
- Solde total
- Distribution des soldes
- Top-ups du jour

---

## 🔍 Requêtes SQL Utiles

### CA par Heure de la Journée

```sql
SELECT 
  EXTRACT(HOUR FROM transaction_date) as hour,
  SUM(amount) as revenue,
  COUNT(*) as transactions
FROM "WeezeventTransaction"
WHERE tenant_id = 'xxx'
  AND status = 'V'
  AND transaction_date >= CURRENT_DATE
GROUP BY hour
ORDER BY hour;
```

### Panier Moyen par Événement

```sql
SELECT 
  e.name as event_name,
  COUNT(DISTINCT t.id) as transaction_count,
  SUM(t.amount) as total_revenue,
  AVG(t.amount) as average_basket
FROM "WeezeventTransaction" t
JOIN "WeezeventEvent" e ON t.event_id = e.weezevent_id
WHERE t.tenant_id = 'xxx'
  AND t.status = 'V'
GROUP BY e.id, e.name
ORDER BY total_revenue DESC;
```

### Produits Jamais Vendus

```sql
SELECT p.*
FROM "WeezeventProduct" p
LEFT JOIN "WeezeventTransactionItem" ti ON p.weezevent_id = ti.product_id
WHERE p.tenant_id = 'xxx'
  AND ti.id IS NULL;
```

---

## 📈 Métriques Clés à Suivre

### Ventes
- **CA total** - Revenu global
- **CA moyen/jour** - Performance quotidienne
- **Panier moyen** - Montant moyen par transaction
- **Taux de conversion** - % visiteurs → acheteurs

### Produits
- **Top 10 produits** - Bestsellers
- **Taux de rotation** - Vitesse de vente
- **Marge par produit** - Rentabilité
- **Stock critique** - Alertes rupture

### Wallets
- **Wallets actifs** - Utilisation
- **Solde moyen** - Engagement
- **Top-ups/jour** - Recharges
- **Taux d'utilisation** - % solde dépensé

### Événements
- **CA par événement** - Performance
- **Affluence** - Nombre de transactions
- **Heure de pointe** - Pic d'activité
- **Durée moyenne** - Temps sur site

---

## 🎨 Visualisations Recommandées

### Chart.js / Recharts

```typescript
// Exemple: Évolution CA
const chartData = {
  labels: dailyRevenue.map(d => d.date),
  datasets: [{
    label: 'Chiffre d\'Affaires',
    data: dailyRevenue.map(d => d.revenue),
    borderColor: 'rgb(75, 192, 192)',
    tension: 0.1
  }]
};
```

### Tableau de Bord React

```tsx
function Dashboard() {
  const { data: revenue } = useQuery('revenue', fetchRevenue);
  const { data: topProducts } = useQuery('topProducts', fetchTopProducts);

  return (
    <div>
      <KPICards revenue={revenue} />
      <RevenueChart data={revenue.daily} />
      <TopProductsTable data={topProducts} />
    </div>
  );
}
```

---

## 🔗 Intégration avec BI Tools

### Metabase

1. Connecter à PostgreSQL
2. Créer des questions:
   - CA par période
   - Top produits
   - Distribution wallets

### Grafana

1. Ajouter source PostgreSQL
2. Créer dashboards
3. Configurer alertes

### Power BI / Tableau

1. Connecter via ODBC
2. Importer tables Weezevent
3. Créer relations
4. Construire rapports

---

## 📊 Exports & Rapports

### Export CSV

```typescript
async exportTransactions(tenantId: string, startDate: Date, endDate: Date) {
  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      tenantId,
      transactionDate: { gte: startDate, lte: endDate },
    },
    include: {
      items: true,
      event: true,
    },
  });

  // Convertir en CSV
  const csv = this.convertToCSV(transactions);
  return csv;
}
```

### Rapport PDF

```typescript
async generateReport(tenantId: string, period: string) {
  const data = await this.getAnalytics(tenantId, period);
  
  // Utiliser puppeteer ou pdfkit
  const pdf = await this.pdfService.generate({
    template: 'monthly-report',
    data,
  });

  return pdf;
}
```

---

## 🚀 Exemples Complets

### API Analytics Complète

```typescript
@Controller('weezevent/analytics')
export class WeezeventAnalyticsController {
  @Get('revenue')
  async getRevenue(@Query() query: RevenueQueryDto) {
    return this.analyticsService.getRevenue(query);
  }

  @Get('products/top')
  async getTopProducts(@Query('limit') limit: number = 10) {
    return this.analyticsService.getTopProducts(limit);
  }

  @Get('events/:eventId')
  async getEventAnalytics(@Param('eventId') eventId: string) {
    return this.analyticsService.getEventAnalytics(eventId);
  }

  @Get('wallets/stats')
  async getWalletStats() {
    return this.analyticsService.getWalletStats();
  }

  @Get('export/transactions')
  async exportTransactions(@Query() query: ExportQueryDto) {
    return this.analyticsService.exportTransactions(query);
  }
}
```

---

## 📚 Ressources

- [Prisma Aggregations](https://www.prisma.io/docs/concepts/components/prisma-client/aggregation-grouping-summarizing)
- [Chart.js](https://www.chartjs.org/)
- [Recharts](https://recharts.org/)
- [Metabase](https://www.metabase.com/)

---

## ✅ Checklist Analytics

- [ ] Définir KPIs métier
- [ ] Créer service analytics
- [ ] Implémenter endpoints API
- [ ] Optimiser requêtes (indexes)
- [ ] Créer dashboards frontend
- [ ] Configurer exports
- [ ] Mettre en place alertes
- [ ] Documenter métriques

---

**🎯 Prêt à exploiter vos données Weezevent !**
