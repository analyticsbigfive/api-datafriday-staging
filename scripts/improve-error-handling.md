# Script d'Amélioration de la Gestion d'Erreurs HTTP

## Services à Améliorer

### ✅ Déjà Améliorés
- menu-components.service.ts
- ingredients.service.ts
- packaging.service.ts

### 🔄 À Améliorer (CRUD Services)
1. menu-items.service.ts
2. market-prices.service.ts
3. suppliers.service.ts
4. organizations.service.ts
5. tenants.service.ts
6. users.service.ts
7. spaces.service.ts
8. events.service.ts
9. space-menus.service.ts

### 🔄 Services Métier (Gestion d'Erreurs Spécifique)
10. analyse.service.ts
11. onboarding.service.ts
12. orchestrator.service.ts
13. space-aggregation.service.ts
14. space-dashboard.service.ts
15. weezevent-*.service.ts (8 services)
16. integrations.service.ts

## Pattern Standard à Appliquer

### Import
```typescript
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
```

### Méthode create()
```typescript
async create(dto: any, tenantId: string) {
  this.logger.log(`Creating [entity] for tenant ${tenantId}`);
  try {
    return await this.prisma.[entity].create({ data: { ...dto, tenantId } });
  } catch (error) {
    this.logger.error(`Failed to create [entity]: ${error.message}`, error.stack);
    if (error.code === 'P2003') {
      throw new BadRequestException(`Invalid reference ID provided`);
    }
    if (error.code === 'P2002') {
      throw new BadRequestException(`A [entity] with this name already exists`);
    }
    throw error;
  }
}
```

### Méthode findAll()
```typescript
async findAll(tenantId: string, page = 1, limit = 100) {
  this.logger.log(`Fetching [entities] for tenant ${tenantId} (page=${page}, limit=${limit})`);
  try {
    // ... existing logic
    this.logger.log(`Found ${data.length}/${total} [entities]`);
    return { data, meta };
  } catch (error) {
    this.logger.error(`Failed to fetch [entities]: ${error.message}`, error.stack);
    throw error;
  }
}
```

### Méthode findOne()
```typescript
async findOne(id: string, tenantId: string) {
  this.logger.log(`Fetching [entity] ${id} for tenant ${tenantId}`);
  const [entity] = await this.prisma.[entity].findFirst({
    where: { id, tenantId, deletedAt: null }
  });
  if (![entity]) {
    this.logger.warn(`[Entity] ${id} not found for tenant ${tenantId}`);
    throw new NotFoundException(`[Entity] with ID ${id} not found`);
  }
  return [entity];
}
```

### Méthode update()
```typescript
async update(id: string, dto: any, tenantId: string) {
  this.logger.log(`Updating [entity] ${id} for tenant ${tenantId}`);
  await this.findOne(id, tenantId);
  try {
    const result = await this.prisma.[entity].update({ where: { id }, data: dto });
    this.logger.log(`[Entity] ${id} updated`);
    return result;
  } catch (error) {
    this.logger.error(`Failed to update [entity] ${id}: ${error.message}`, error.stack);
    if (error.code === 'P2003') {
      throw new BadRequestException(`Invalid reference ID provided`);
    }
    if (error.code === 'P2025') {
      throw new NotFoundException(`[Entity] with ID ${id} not found`);
    }
    throw error;
  }
}
```

### Méthode remove()
```typescript
async remove(id: string, tenantId: string) {
  this.logger.log(`Deleting [entity] ${id} for tenant ${tenantId}`);
  await this.findOne(id, tenantId);
  try {
    const result = await this.prisma.[entity].update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    this.logger.log(`[Entity] ${id} soft-deleted`);
    return result;
  } catch (error) {
    this.logger.error(`Failed to delete [entity] ${id}: ${error.message}`, error.stack);
    if (error.code === 'P2025') {
      throw new NotFoundException(`[Entity] with ID ${id} not found`);
    }
    throw error;
  }
}
```

## Codes Prisma à Gérer

| Code | Signification | Code HTTP | Message Type |
|------|---------------|-----------|--------------|
| P2002 | Unique constraint | 400 | "already exists" |
| P2003 | Foreign key violation | 400 | "Invalid reference ID" |
| P2025 | Record not found | 404 | "not found" |
| P2016 | Query error | 400 | "Invalid query" |

## Validation

Après chaque modification :
1. Vérifier que le build passe : `npm run build`
2. Vérifier les imports BadRequestException
3. Vérifier que tous les try-catch sont en place
4. Vérifier les messages d'erreur clairs
