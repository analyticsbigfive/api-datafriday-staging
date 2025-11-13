import { Injectable, OnModuleInit, Scope } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { REQUEST } from '@nestjs/core';
import { Inject } from '@nestjs/common';

/**
 * PrismaService avec isolation automatique par tenant
 * Utilise REQUEST scope pour injecter le tenantId par requête
 */
@Injectable({ scope: Scope.REQUEST })
export class PrismaTenantService extends PrismaClient implements OnModuleInit {
  constructor(@Inject(REQUEST) private readonly request: any) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.enableTenantIsolation();
  }

  /**
   * Active l'isolation tenant via middleware Prisma
   * Injecte automatiquement le tenantId sur toutes les queries
   */
  private enableTenantIsolation() {
    const tenantId = this.request?.tenantId;

    if (!tenantId) {
      // Skip pour requêtes publiques ou système (health check, etc.)
      return;
    }

    // Middleware pour injection automatique du tenantId
    this.$use(async (params, next) => {
      // Modèles avec tenantId direct
      const tenantModels = ['User', 'Space', 'Supplier', 'Tenant'];
      
      // Modèles avec tenantId indirect (via relation)
      const spaceRelatedModels = [
        'Config', 'Floor', 'PointOfSale', 'Menu', 'Station', 'Event'
      ];
      
      const productRelatedModels = [
        'Product', 'MarketPrice', 'Ingredient', 'Stock'
      ];

      // === MODÈLES AVEC TENANTID DIRECT ===
      if (tenantModels.includes(params.model)) {
        if (params.action === 'findUnique' || params.action === 'findFirst') {
          params.args.where = {
            ...params.args.where,
            tenantId,
          };
        } else if (params.action === 'findMany') {
          if (params.args.where) {
            if (params.args.where.AND) {
              params.args.where.AND.push({ tenantId });
            } else {
              params.args.where = { AND: [params.args.where, { tenantId }] };
            }
          } else {
            params.args.where = { tenantId };
          }
        } else if (['create', 'upsert', 'createMany'].includes(params.action)) {
          if (params.args.data) {
            if (Array.isArray(params.args.data)) {
              params.args.data = params.args.data.map((item) => ({
                ...item,
                tenantId,
              }));
            } else {
              params.args.data = { ...params.args.data, tenantId };
            }
          }
        } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
          params.args.where = {
            ...params.args.where,
            tenantId,
          };
        }
      }

      // === MODÈLES LIÉS À SPACE ===
      if (spaceRelatedModels.includes(params.model)) {
        // Récupérer les spaceIds du tenant
        const spaces = await this.space.findMany({
          where: { tenantId },
          select: { id: true },
        });
        const spaceIds = spaces.map(s => s.id);

        if (['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
          params.args.where = {
            ...params.args.where,
            spaceId: { in: spaceIds },
          };
        } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
          params.args.where = {
            ...params.args.where,
            spaceId: { in: spaceIds },
          };
        }
      }

      // === MODÈLES LIÉS À PRODUCT/SUPPLIER ===
      if (productRelatedModels.includes(params.model)) {
        // Récupérer les supplierIds du tenant
        const suppliers = await this.supplier.findMany({
          where: { tenantId },
          select: { id: true },
        });
        const supplierIds = suppliers.map(s => s.id);

        // Récupérer les productIds
        const products = await this.product.findMany({
          where: { supplierId: { in: supplierIds } },
          select: { id: true },
        });
        const productIds = products.map(p => p.id);

        if (params.model === 'Product') {
          if (['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
            params.args.where = {
              ...params.args.where,
              supplierId: { in: supplierIds },
            };
          } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
            params.args.where = {
              ...params.args.where,
              supplierId: { in: supplierIds },
            };
          }
        } else {
          // MarketPrice, Ingredient, Stock
          if (['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
            params.args.where = {
              ...params.args.where,
              productId: { in: productIds },
            };
          } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
            params.args.where = {
              ...params.args.where,
              productId: { in: productIds },
            };
          }
        }
      }

      return next(params);
    });

    // Middleware pour définir les claims Postgres (pour RLS)
    this.$use(async (params, next) => {
      // Définir le claim org_id pour RLS Supabase
      await this.$executeRaw`
        SELECT set_config('request.jwt.claims', json_build_object('org_id', ${tenantId})::text, true);
      `;

      return next(params);
    });
  }

  /**
   * Méthode pour bypass l'isolation (admin/système uniquement)
   */
  withoutTenantIsolation<T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T> {
    // Créer une nouvelle instance sans middleware
    const prisma = new PrismaClient();
    return callback(prisma).finally(() => prisma.$disconnect());
  }
}
