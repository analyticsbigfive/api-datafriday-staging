# Analytics Weezevent - Guide Complet

## 📊 Vue d'ensemble

Ce document détaille tous les cas d'usage analytics possibles avec les données Weezevent synchronisées dans DataFriday.

---

## 🎯 Données Disponibles pour Analytics

### Sources de Données

```typescript
// Toutes les données enrichies disponibles
interface AnalyticsDataSources {
  transactions: WeezeventTransaction[];      // Transactions avec tous les détails
  events: WeezeventEvent[];                  // Événements
  merchants: WeezeventMerchant[];            // Marchands/Fundations
  locations: WeezeventLocation[];            // Emplacements/Zones
  products: WeezeventProduct[];              // Produits vendus
  users: WeezeventUser[];                    // Clients
  wallets: WeezeventWallet[];                // Wallets (soldes)
  payments: WeezeventPayment[];              // Détails des paiements
}
```

---

## 📈 Analytics par Événement

### 1. Chiffre d'Affaires Total

**Requête Prisma:**
```typescript
async getEventRevenue(eventId: string) {
  const result = await this.prisma.weezeventTransaction.aggregate({
    where: {
      eventId,
      status: 'V', // Validées uniquement
    },
    _sum: {
      amount: true,
    },
    _count: true,
  });

  return {
    totalRevenue: result._sum.amount || 0,
    transactionCount: result._count,
  };
}
```

**Exemple de résultat:**
```json
{
  "eventId": "evt_123",
  "eventName": "MusicFest 2021",
  "totalRevenue": 125000.00,
  "transactionCount": 3450,
  "averageTransactionValue": 36.23
}
```

---

### 2. Produits les Plus Vendus

**Requête Prisma:**
```typescript
async getTopProductsByEvent(eventId: string, limit: number = 10) {
  const items = await this.prisma.weezeventTransactionItem.groupBy({
    by: ['productId'],
    where: {
      transaction: {
        eventId,
        status: 'V',
      },
    },
    _sum: {
      quantity: true,
    },
    _count: true,
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: limit,
  });

  // Enrichir avec les détails des produits
  const enriched = await Promise.all(
    items.map(async (item) => {
      const product = await this.prisma.weezeventProduct.findUnique({
        where: { id: item.productId },
      });
      
      return {
        product,
        quantitySold: item._sum.quantity,
        transactionCount: item._count,
      };
    })
  );

  return enriched;
}
```

**Exemple de résultat:**
```json
[
  {
    "product": {
      "id": "prod_5",
      "name": "Burger Deluxe",
      "category": "food",
      "basePrice": 5.00
    },
    "quantitySold": 1250,
    "transactionCount": 890,
    "revenue": 6250.00
  },
  {
    "product": {
      "id": "prod_12",
      "name": "Bière Pression",
      "category": "beverage",
      "basePrice": 4.00
    },
    "quantitySold": 2100,
    "transactionCount": 1450,
    "revenue": 8400.00
  }
]
```

---

### 3. Revenus par Jour

**Requête Prisma:**
```typescript
async getDailyRevenue(eventId: string) {
  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      eventId,
      status: 'V',
    },
    select: {
      transactionDate: true,
      amount: true,
    },
  });

  // Grouper par jour
  const dailyRevenue = transactions.reduce((acc, tx) => {
    const date = tx.transactionDate.toISOString().split('T')[0];
    
    if (!acc[date]) {
      acc[date] = {
        date,
        revenue: 0,
        transactionCount: 0,
      };
    }
    
    acc[date].revenue += Number(tx.amount);
    acc[date].transactionCount += 1;
    
    return acc;
  }, {} as Record<string, any>);

  return Object.values(dailyRevenue).sort((a, b) => 
    a.date.localeCompare(b.date)
  );
}
```

**Exemple de résultat:**
```json
[
  {
    "date": "2021-04-16",
    "revenue": 42000.00,
    "transactionCount": 1150
  },
  {
    "date": "2021-04-17",
    "revenue": 58000.00,
    "transactionCount": 1600
  },
  {
    "date": "2021-04-18",
    "revenue": 25000.00,
    "transactionCount": 700
  }
]
```

---

### 4. Revenus par Heure (Peak Hours)

**Requête Prisma:**
```typescript
async getHourlyRevenue(eventId: string, date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      eventId,
      status: 'V',
      transactionDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      transactionDate: true,
      amount: true,
    },
  });

  // Grouper par heure
  const hourlyRevenue = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    revenue: 0,
    transactionCount: 0,
  }));

  transactions.forEach((tx) => {
    const hour = tx.transactionDate.getHours();
    hourlyRevenue[hour].revenue += Number(tx.amount);
    hourlyRevenue[hour].transactionCount += 1;
  });

  return hourlyRevenue;
}
```

**Visualisation:**
```
Revenus par Heure - 16 Avril 2021
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12h: ████████████████████ 4,200€ (120 tx)
13h: ██████████████████████████ 5,800€ (165 tx)
14h: ████████████████████████ 5,200€ (148 tx)
15h: ██████████████████ 3,800€ (105 tx)
16h: ████████████████ 3,200€ (92 tx)
17h: ██████████████████████ 4,600€ (132 tx)
18h: ████████████████████████████ 6,200€ (178 tx)
19h: ██████████████████████████████ 6,800€ (195 tx)
20h: ████████████████████████████ 6,400€ (182 tx)
21h: ████████████████████ 4,400€ (125 tx)
```

---

## 🏪 Analytics par Marchand

### 1. Performance des Marchands

**Requête Prisma:**
```typescript
async getMerchantPerformance(eventId: string) {
  const merchants = await this.prisma.weezeventMerchant.findMany({
    where: {
      transactions: {
        some: {
          eventId,
        },
      },
    },
    include: {
      transactions: {
        where: {
          eventId,
          status: 'V',
        },
        include: {
          items: {
            include: {
              payments: true,
            },
          },
        },
      },
    },
  });

  return merchants.map((merchant) => {
    const totalRevenue = merchant.transactions.reduce(
      (sum, tx) => sum + Number(tx.amount),
      0
    );
    
    const totalTransactions = merchant.transactions.length;
    
    const totalItems = merchant.transactions.reduce(
      (sum, tx) => sum + tx.items.reduce((s, item) => s + item.quantity, 0),
      0
    );

    return {
      merchantId: merchant.id,
      merchantName: merchant.name,
      totalRevenue,
      totalTransactions,
      totalItems,
      averageTransactionValue: totalRevenue / totalTransactions,
      averageItemsPerTransaction: totalItems / totalTransactions,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);
}
```

**Exemple de résultat:**
```json
[
  {
    "merchantId": "merch_3",
    "merchantName": "The Burger Corner",
    "totalRevenue": 28500.00,
    "totalTransactions": 890,
    "totalItems": 1250,
    "averageTransactionValue": 32.02,
    "averageItemsPerTransaction": 1.40,
    "rank": 1
  },
  {
    "merchantId": "merch_7",
    "merchantName": "Beer Garden",
    "totalRevenue": 24800.00,
    "totalTransactions": 1450,
    "totalItems": 2100,
    "averageTransactionValue": 17.10,
    "averageItemsPerTransaction": 1.45,
    "rank": 2
  }
]
```

---

### 2. Produits Populaires par Marchand

**Requête Prisma:**
```typescript
async getMerchantTopProducts(merchantId: string, eventId: string) {
  const items = await this.prisma.weezeventTransactionItem.groupBy({
    by: ['productId'],
    where: {
      transaction: {
        merchantId,
        eventId,
        status: 'V',
      },
    },
    _sum: {
      quantity: true,
      unitPrice: true,
    },
    _count: true,
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
  });

  // Enrichir avec les produits
  const enriched = await Promise.all(
    items.map(async (item) => {
      const product = await this.prisma.weezeventProduct.findUnique({
        where: { id: item.productId },
      });
      
      return {
        product,
        quantitySold: item._sum.quantity,
        revenue: item._sum.quantity * item._sum.unitPrice,
        transactionCount: item._count,
      };
    })
  );

  return enriched;
}
```

---

### 3. Évolution des Ventes par Marchand

**Requête Prisma:**
```typescript
async getMerchantSalesTrend(merchantId: string, eventId: string) {
  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      merchantId,
      eventId,
      status: 'V',
    },
    select: {
      transactionDate: true,
      amount: true,
    },
    orderBy: {
      transactionDate: 'asc',
    },
  });

  // Grouper par heure
  const hourlyTrend = transactions.reduce((acc, tx) => {
    const hour = tx.transactionDate.toISOString().slice(0, 13) + ':00:00';
    
    if (!acc[hour]) {
      acc[hour] = {
        timestamp: hour,
        revenue: 0,
        transactionCount: 0,
        cumulativeRevenue: 0,
      };
    }
    
    acc[hour].revenue += Number(tx.amount);
    acc[hour].transactionCount += 1;
    
    return acc;
  }, {} as Record<string, any>);

  // Calculer le cumulatif
  let cumulative = 0;
  const trend = Object.values(hourlyTrend).map((item) => {
    cumulative += item.revenue;
    item.cumulativeRevenue = cumulative;
    return item;
  });

  return trend;
}
```

---

## 📍 Analytics par Zone/Location

### 1. Revenus par Zone

**Requête Prisma:**
```typescript
async getRevenueByLocation(eventId: string) {
  const locations = await this.prisma.weezeventLocation.findMany({
    where: {
      eventId,
    },
    include: {
      transactions: {
        where: {
          status: 'V',
        },
      },
    },
  });

  return locations.map((location) => {
    const totalRevenue = location.transactions.reduce(
      (sum, tx) => sum + Number(tx.amount),
      0
    );
    
    return {
      locationId: location.id,
      locationName: location.name,
      locationType: location.type,
      totalRevenue,
      transactionCount: location.transactions.length,
      averageTransactionValue: totalRevenue / location.transactions.length,
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);
}
```

**Exemple de résultat:**
```json
[
  {
    "locationId": "loc_12",
    "locationName": "Northern foodtruck area",
    "locationType": "foodtruck_area",
    "totalRevenue": 45200.00,
    "transactionCount": 1250,
    "averageTransactionValue": 36.16,
    "percentageOfTotal": 36.2
  },
  {
    "locationId": "loc_8",
    "locationName": "Main Stage Bar",
    "locationType": "bar",
    "totalRevenue": 38900.00,
    "transactionCount": 1850,
    "averageTransactionValue": 21.03,
    "percentageOfTotal": 31.1
  }
]
```

---

### 2. Affluence par Zone

**Requête Prisma:**
```typescript
async getLocationTraffic(eventId: string) {
  const locations = await this.prisma.weezeventLocation.findMany({
    where: {
      eventId,
    },
    include: {
      transactions: {
        where: {
          status: 'V',
        },
        select: {
          transactionDate: true,
        },
      },
    },
  });

  return locations.map((location) => {
    // Calculer l'affluence par heure
    const hourlyTraffic = Array.from({ length: 24 }, () => 0);
    
    location.transactions.forEach((tx) => {
      const hour = tx.transactionDate.getHours();
      hourlyTraffic[hour] += 1;
    });

    const peakHour = hourlyTraffic.indexOf(Math.max(...hourlyTraffic));
    
    return {
      locationId: location.id,
      locationName: location.name,
      totalTransactions: location.transactions.length,
      peakHour,
      peakHourTransactions: hourlyTraffic[peakHour],
      hourlyTraffic,
    };
  });
}
```

**Visualisation:**
```
Affluence par Zone - MusicFest 2021
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Northern foodtruck area
Peak: 19h (195 transactions)
████████████████████████████████████████ 1,250 tx

Main Stage Bar
Peak: 21h (178 transactions)
████████████████████████████████████ 1,850 tx

South Entrance Shop
Peak: 18h (142 transactions)
████████████████████████ 890 tx
```

---

### 3. Produits Populaires par Zone

**Requête Prisma:**
```typescript
async getTopProductsByLocation(locationId: string, eventId: string) {
  const items = await this.prisma.weezeventTransactionItem.groupBy({
    by: ['productId'],
    where: {
      transaction: {
        locationId,
        eventId,
        status: 'V',
      },
    },
    _sum: {
      quantity: true,
    },
    orderBy: {
      _sum: {
        quantity: 'desc',
      },
    },
    take: 10,
  });

  // Enrichir avec les produits
  const enriched = await Promise.all(
    items.map(async (item) => {
      const product = await this.prisma.weezeventProduct.findUnique({
        where: { id: item.productId },
      });
      
      return {
        product,
        quantitySold: item._sum.quantity,
      };
    })
  );

  return enriched;
}
```

---

## 👥 Analytics Client

### 1. Profil des Clients

**Requête Prisma:**
```typescript
async getCustomerProfile(eventId: string) {
  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      eventId,
      status: 'V',
    },
    include: {
      items: {
        include: {
          payments: {
            include: {
              wallet: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Analyser les clients
  const customerStats = new Map();

  transactions.forEach((tx) => {
    tx.items.forEach((item) => {
      item.payments.forEach((payment) => {
        if (payment.wallet?.user) {
          const userId = payment.wallet.user[0]?.id;
          
          if (!customerStats.has(userId)) {
            customerStats.set(userId, {
              user: payment.wallet.user[0],
              totalSpent: 0,
              transactionCount: 0,
              itemsPurchased: 0,
            });
          }
          
          const stats = customerStats.get(userId);
          stats.totalSpent += Number(payment.amount);
          stats.transactionCount += 1;
          stats.itemsPurchased += item.quantity;
        }
      });
    });
  });

  return Array.from(customerStats.values())
    .sort((a, b) => b.totalSpent - a.totalSpent);
}
```

---

### 2. Top Clients (VIP)

**Requête Prisma:**
```typescript
async getTopCustomers(eventId: string, limit: number = 20) {
  const customers = await this.getCustomerProfile(eventId);
  
  return customers.slice(0, limit).map((customer, index) => ({
    rank: index + 1,
    email: customer.user.email,
    firstName: customer.user.firstName,
    lastName: customer.user.lastName,
    totalSpent: customer.totalSpent,
    transactionCount: customer.transactionCount,
    itemsPurchased: customer.itemsPurchased,
    averageTransactionValue: customer.totalSpent / customer.transactionCount,
  }));
}
```

**Exemple de résultat:**
```json
[
  {
    "rank": 1,
    "email": "marie.dupont@example.com",
    "firstName": "Marie",
    "lastName": "Dupont",
    "totalSpent": 285.50,
    "transactionCount": 12,
    "itemsPurchased": 18,
    "averageTransactionValue": 23.79
  }
]
```

---

## 💰 Rapports Financiers

### 1. Rapport Financier Complet

**Requête Prisma:**
```typescript
async getFinancialReport(eventId: string) {
  const event = await this.prisma.weezeventEvent.findUnique({
    where: { id: eventId },
    include: {
      transactions: {
        where: { status: 'V' },
        include: {
          items: {
            include: {
              payments: {
                include: {
                  wallet: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Calculer les totaux
  const totalRevenue = event.transactions.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  );

  // Grouper par méthode de paiement
  const paymentMethods = {};
  event.transactions.forEach((tx) => {
    tx.items.forEach((item) => {
      item.payments.forEach((payment) => {
        const methodId = payment.paymentMethodId || 'unknown';
        
        if (!paymentMethods[methodId]) {
          paymentMethods[methodId] = {
            amount: 0,
            count: 0,
          };
        }
        
        paymentMethods[methodId].amount += Number(payment.amount);
        paymentMethods[methodId].count += 1;
      });
    });
  });

  // Calculer la TVA
  const totalVAT = event.transactions.reduce((sum, tx) => {
    return sum + tx.items.reduce((s, item) => {
      return s + item.payments.reduce((p, payment) => {
        return p + Number(payment.amountVat);
      }, 0);
    }, 0);
  }, 0);

  return {
    eventId: event.id,
    eventName: event.name,
    period: {
      start: event.startDate,
      end: event.endDate,
    },
    summary: {
      totalRevenue,
      totalVAT,
      revenueExcludingVAT: totalRevenue - totalVAT,
      transactionCount: event.transactions.length,
      averageTransactionValue: totalRevenue / event.transactions.length,
    },
    paymentMethods,
  };
}
```

**Exemple de résultat:**
```json
{
  "eventId": "evt_123",
  "eventName": "MusicFest 2021",
  "period": {
    "start": "2021-04-16T00:00:00Z",
    "end": "2021-04-18T23:59:59Z"
  },
  "summary": {
    "totalRevenue": 125000.00,
    "totalVAT": 12500.00,
    "revenueExcludingVAT": 112500.00,
    "transactionCount": 3450,
    "averageTransactionValue": 36.23
  },
  "paymentMethods": {
    "card": {
      "amount": 75000.00,
      "count": 2100,
      "percentage": 60.0
    },
    "wallet": {
      "amount": 50000.00,
      "count": 1350,
      "percentage": 40.0
    }
  }
}
```

---

### 2. Rapport par Catégorie de Produits

**Requête Prisma:**
```typescript
async getRevenueByCategoryReport(eventId: string) {
  const items = await this.prisma.weezeventTransactionItem.findMany({
    where: {
      transaction: {
        eventId,
        status: 'V',
      },
    },
    include: {
      product: true,
      payments: true,
    },
  });

  // Grouper par catégorie
  const categories = {};
  
  items.forEach((item) => {
    const category = item.product?.category || 'uncategorized';
    
    if (!categories[category]) {
      categories[category] = {
        revenue: 0,
        quantity: 0,
        transactionCount: 0,
      };
    }
    
    const itemRevenue = item.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );
    
    categories[category].revenue += itemRevenue;
    categories[category].quantity += item.quantity;
    categories[category].transactionCount += 1;
  });

  return Object.entries(categories).map(([category, stats]) => ({
    category,
    ...stats,
    averagePrice: stats.revenue / stats.quantity,
  })).sort((a, b) => b.revenue - a.revenue);
}
```

---

## 📊 Dashboards Recommandés

### Dashboard 1: Vue d'Ensemble Événement

```typescript
interface EventOverviewDashboard {
  // KPIs principaux
  kpis: {
    totalRevenue: number;
    totalTransactions: number;
    averageTransactionValue: number;
    totalCustomers: number;
  };
  
  // Graphiques
  charts: {
    dailyRevenue: DailyRevenueChart;
    hourlyTraffic: HourlyTrafficChart;
    topProducts: TopProductsChart;
    revenueByLocation: LocationRevenueChart;
  };
  
  // Tableaux
  tables: {
    topMerchants: MerchantPerformanceTable;
    topCustomers: CustomerTable;
  };
}
```

---

### Dashboard 2: Performance Marchand

```typescript
interface MerchantDashboard {
  merchant: WeezeventMerchant;
  
  kpis: {
    totalRevenue: number;
    totalTransactions: number;
    totalItems: number;
    averageTransactionValue: number;
  };
  
  charts: {
    salesTrend: SalesTrendChart;
    topProducts: ProductPerformanceChart;
    hourlyPerformance: HourlyPerformanceChart;
  };
}
```

---

### Dashboard 3: Analytics Client

```typescript
interface CustomerAnalyticsDashboard {
  kpis: {
    totalCustomers: number;
    averageSpendPerCustomer: number;
    repeatCustomerRate: number;
  };
  
  charts: {
    customerSegmentation: SegmentationChart;
    spendingDistribution: DistributionChart;
    topCustomers: TopCustomersChart;
  };
}
```

---

## 🔍 Exemples de Requêtes Complexes

### 1. Analyse de Panier Moyen

```typescript
async getBasketAnalysis(eventId: string) {
  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      eventId,
      status: 'V',
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  const baskets = transactions.map((tx) => {
    const products = tx.items.map((item) => ({
      name: item.product?.name,
      category: item.product?.category,
      quantity: item.quantity,
    }));
    
    return {
      transactionId: tx.id,
      totalAmount: Number(tx.amount),
      itemCount: tx.items.reduce((sum, item) => sum + item.quantity, 0),
      products,
    };
  });

  // Analyser les combinaisons fréquentes
  const combinations = new Map();
  
  baskets.forEach((basket) => {
    if (basket.products.length > 1) {
      const productNames = basket.products
        .map((p) => p.name)
        .sort()
        .join(' + ');
      
      combinations.set(
        productNames,
        (combinations.get(productNames) || 0) + 1
      );
    }
  });

  return {
    averageBasketValue: baskets.reduce((sum, b) => sum + b.totalAmount, 0) / baskets.length,
    averageItemsPerBasket: baskets.reduce((sum, b) => sum + b.itemCount, 0) / baskets.length,
    topCombinations: Array.from(combinations.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([combo, count]) => ({ combo, count })),
  };
}
```

---

### 2. Analyse de Rétention Client

```typescript
async getCustomerRetention(eventId: string) {
  const transactions = await this.prisma.weezeventTransaction.findMany({
    where: {
      eventId,
      status: 'V',
    },
    include: {
      items: {
        include: {
          payments: {
            include: {
              wallet: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      transactionDate: 'asc',
    },
  });

  // Analyser les clients récurrents
  const customerTransactions = new Map();
  
  transactions.forEach((tx) => {
    tx.items.forEach((item) => {
      item.payments.forEach((payment) => {
        if (payment.wallet?.user?.[0]) {
          const userId = payment.wallet.user[0].id;
          
          if (!customerTransactions.has(userId)) {
            customerTransactions.set(userId, []);
          }
          
          customerTransactions.get(userId).push({
            date: tx.transactionDate,
            amount: Number(payment.amount),
          });
        }
      });
    });
  });

  // Calculer les métriques de rétention
  const totalCustomers = customerTransactions.size;
  const repeatCustomers = Array.from(customerTransactions.values())
    .filter((txs) => txs.length > 1).length;
  
  return {
    totalCustomers,
    repeatCustomers,
    retentionRate: (repeatCustomers / totalCustomers) * 100,
    averageTransactionsPerCustomer: 
      Array.from(customerTransactions.values())
        .reduce((sum, txs) => sum + txs.length, 0) / totalCustomers,
  };
}
```

---

## 📈 Export et Visualisation

### Format d'Export CSV

```typescript
async exportEventAnalytics(eventId: string): Promise<string> {
  const data = await this.getFinancialReport(eventId);
  
  // Convertir en CSV
  const csv = [
    ['Metric', 'Value'],
    ['Total Revenue', data.summary.totalRevenue],
    ['Total VAT', data.summary.totalVAT],
    ['Revenue Excluding VAT', data.summary.revenueExcludingVAT],
    ['Transaction Count', data.summary.transactionCount],
    ['Average Transaction Value', data.summary.averageTransactionValue],
  ].map((row) => row.join(',')).join('\n');
  
  return csv;
}
```

---

## 🎯 Résumé des Analytics Disponibles

| Catégorie | Analytics | Complexité |
|-----------|-----------|------------|
| **Événement** | CA total, produits populaires, revenus par jour/heure | 🟢 Simple |
| **Marchand** | Performance, top produits, évolution ventes | 🟢 Simple |
| **Zone** | Revenus par zone, affluence, produits par zone | 🟡 Moyenne |
| **Client** | Profil, top clients, rétention | 🟡 Moyenne |
| **Financier** | Rapport complet, par catégorie, par méthode paiement | 🟡 Moyenne |
| **Avancé** | Panier moyen, combinaisons, prédictions | 🔴 Complexe |

---

**Prochaines étapes:**
1. Implémenter les requêtes de base
2. Créer les dashboards
3. Ajouter l'export CSV/Excel
4. Implémenter les graphiques
