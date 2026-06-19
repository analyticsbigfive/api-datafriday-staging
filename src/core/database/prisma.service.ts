import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import {
  BYPASS_TENANT_KEY,
  TENANT_ID_KEY,
} from '../tenant/tenant-context.constants';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Models that carry a REQUIRED `tenantId` scalar — the ones eligible for
   * automatic tenant scoping. Derived from the Prisma DMMF so it stays in sync
   * with the schema. Models with a nullable tenantId (e.g. Permission, whose
   * system catalog rows have tenantId = null) are intentionally excluded.
   */
  private readonly tenantScopedModels: Set<string> = new Set(
    Prisma.dmmf.datamodel.models
      .filter((model) =>
        model.fields.some(
          (field) =>
            field.name === 'tenantId' &&
            field.isRequired &&
            !field.isList &&
            field.kind === 'scalar',
        ),
      )
      .map((model) => model.name),
  );

  constructor(private readonly cls: ClsService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'colorless',
    });

    const slowQueryThresholdMs = Number(
      process.env.PRISMA_SLOW_QUERY_MS ||
        (process.env.NODE_ENV === 'production' ? 500 : 0),
    );

    // Log queries:
    //  - en développement: tout (debug)
    //  - en production: uniquement les requêtes lentes (> seuil) en warn
    this.$on('query' as never, (e: any) => {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(`Query: ${e.query} | Params: ${e.params} | ${e.duration}ms`);
        return;
      }
      if (slowQueryThresholdMs > 0 && e.duration >= slowQueryThresholdMs) {
        this.logger.warn(`SLOW QUERY (${e.duration}ms): ${e.query}`);
      }
    });

    // Log errors
    this.$on('error' as never, (e: any) => {
      this.logger.error(`Prisma Error: ${e.message}`, e.target);
    });

    this.registerTenantScopeMiddleware();
  }

  /**
   * Automatic multi-tenant isolation.
   *
   * Injects `tenantId` into the WHERE clause (reads/updates/deletes) and into
   * `data` (creates) for every tenant-scoped model, using the tenant resolved
   * for the current request (CLS).
   *
   * No-ops when:
   *  - there is no active request context (background jobs, seeds, webhooks);
   *  - scoping is explicitly bypassed (TenantContextService.runWithoutTenantScope);
   *  - the model is not tenant-scoped;
   *  - the caller already constrained `tenantId` (we never override it).
   *
   * Relies on Prisma 5 "extended where unique": adding a `tenantId` scalar
   * filter alongside a unique selector is valid for findUnique/update/delete,
   * so we never need to rewrite the query action.
   */
  private registerTenantScopeMiddleware(): void {
    this.$use(async (params, next) => {
      const model = params.model;

      const hasContext = this.cls?.isActive?.() ?? false;
      const bypass = hasContext
        ? this.cls.get<boolean>(BYPASS_TENANT_KEY) === true
        : true;
      const tenantId = hasContext
        ? this.cls.get<string | undefined>(TENANT_ID_KEY)
        : undefined;

      if (!model || bypass || !tenantId || !this.tenantScopedModels.has(model)) {
        return next(params);
      }

      this.applyTenantScope(params, tenantId);
      return next(params);
    });
  }

  private applyTenantScope(
    params: Prisma.MiddlewareParams,
    tenantId: string,
  ): void {
    const args = (params.args ?? {}) as Record<string, any>;

    switch (params.action) {
      case 'findUnique':
      case 'findUniqueOrThrow':
      case 'findFirst':
      case 'findFirstOrThrow':
      case 'findMany':
      case 'count':
      case 'aggregate':
      case 'groupBy':
      case 'update':
      case 'updateMany':
      case 'delete':
      case 'deleteMany': {
        args.where = this.mergeTenantWhere(args.where, tenantId);
        break;
      }

      case 'upsert': {
        args.where = this.mergeTenantWhere(args.where, tenantId);
        if (args.create && typeof args.create === 'object') {
          args.create.tenantId = args.create.tenantId ?? tenantId;
        }
        break;
      }

      case 'create': {
        this.setTenantOnData(args.data, tenantId);
        break;
      }

      case 'createMany': {
        if (Array.isArray(args.data)) {
          args.data.forEach((row: any) => this.setTenantOnData(row, tenantId));
        } else {
          this.setTenantOnData(args.data, tenantId);
        }
        break;
      }

      default:
        break;
    }

    params.args = args;
  }

  /** Merge tenantId into a WHERE clause, never overriding an explicit one. */
  private mergeTenantWhere(where: any, tenantId: string): any {
    if (where && typeof where === 'object' && 'tenantId' in where) {
      return where; // caller already scoped — respect it
    }
    return { ...(where ?? {}), tenantId };
  }

  private setTenantOnData(data: any, tenantId: string): void {
    if (data && typeof data === 'object' && data.tenantId === undefined) {
      data.tenantId = tenantId;
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Database connection failed', error);
      
      // En développement, on permet à l'API de démarrer sans DB
      // Les endpoints qui nécessitent Prisma échoueront, mais le health check fonctionnera
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn('⚠️  Continuing in development mode without database connection');
        this.logger.warn('⚠️  Check your DATABASE_URL in envFiles/.env.development');
        return;
      }
      
      // En production, on bloque le démarrage si la DB est inaccessible
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Enable transaction with retry logic
   */
  async executeTransaction<T>(
    callback: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(async (tx) => callback(tx as PrismaClient));
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Transaction attempt ${attempt}/${maxRetries} failed: ${error.message}`,
        );

        if (attempt < maxRetries) {
          // Exponential backoff
          await this.sleep(Math.pow(2, attempt) * 100);
        }
      }
    }

    this.logger.error(
      `Transaction failed after ${maxRetries} attempts`,
      lastError.stack,
    );
    throw lastError;
  }

  /**
   * Clean database (for testing)
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => key[0] !== '_' && key[0] !== '$',
    );

    await Promise.all(
      models.map((modelKey) => {
        const model = this[modelKey as keyof this];
        if (model && typeof model === 'object' && 'deleteMany' in model) {
          return (model as any).deleteMany();
        }
      }),
    );

    this.logger.log('Database cleaned');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
