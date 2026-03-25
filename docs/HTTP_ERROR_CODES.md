# Guide des Codes d'Erreur HTTP

Ce document décrit les codes d'erreur HTTP utilisés dans l'API et quand les utiliser.

## Codes d'Erreur Principaux

### 400 Bad Request
**Utilisation** : Erreurs de validation ou de logique métier causées par des données invalides envoyées par le client.

**Exemples** :
- Données manquantes ou invalides dans le DTO
- ID de référence invalide (foreign key inexistante)
- Violation de contrainte unique (duplicate)
- Cycle détecté dans les relations
- Format de données incorrect

**Codes Prisma associés** :
- `P2002` : Violation de contrainte unique
- `P2003` : Violation de contrainte de clé étrangère
- `P2025` : Enregistrement non trouvé lors d'une opération

### 404 Not Found
**Utilisation** : Ressource demandée n'existe pas.

**Exemples** :
- GET `/api/v1/menu-components/{id}` avec un ID inexistant
- Tentative d'accès à une ressource soft-deleted
- Ressource n'appartenant pas au tenant actuel

### 500 Internal Server Error
**Utilisation** : Erreur serveur inattendue (erreur de programmation, base de données indisponible, etc.).

**Exemples** :
- Erreur de connexion à la base de données
- Exception non gérée dans le code
- Erreur de configuration

## Implémentation dans les Services

### Pattern de Gestion d'Erreurs

```typescript
async create(dto: CreateDto, tenantId: string) {
  this.logger.log(`Creating resource for tenant ${tenantId}`);
  try {
    return await this.prisma.resource.create({
      data: { ...dto, tenantId }
    });
  } catch (error) {
    this.logger.error(`Failed to create resource: ${error.message}`, error.stack);
    
    // 400 - Foreign key violation
    if (error.code === 'P2003') {
      throw new BadRequestException(`Invalid reference ID provided`);
    }
    
    // 400 - Unique constraint violation
    if (error.code === 'P2002') {
      throw new BadRequestException(`A resource with this name already exists`);
    }
    
    // 500 - Autres erreurs
    throw error;
  }
}

async findOne(id: string, tenantId: string) {
  this.logger.log(`Fetching resource ${id} for tenant ${tenantId}`);
  const resource = await this.prisma.resource.findFirst({
    where: { id, tenantId, deletedAt: null }
  });
  
  if (!resource) {
    this.logger.warn(`Resource ${id} not found for tenant ${tenantId}`);
    throw new NotFoundException(`Resource with ID ${id} not found`);
  }
  
  return resource;
}

async update(id: string, dto: UpdateDto, tenantId: string) {
  this.logger.log(`Updating resource ${id} for tenant ${tenantId}`);
  await this.findOne(id, tenantId); // 404 si non trouvé
  
  try {
    return await this.prisma.resource.update({
      where: { id },
      data: dto
    });
  } catch (error) {
    this.logger.error(`Failed to update resource ${id}: ${error.message}`, error.stack);
    
    if (error.code === 'P2003') {
      throw new BadRequestException(`Invalid reference ID provided`);
    }
    
    if (error.code === 'P2025') {
      throw new NotFoundException(`Resource with ID ${id} not found`);
    }
    
    throw error;
  }
}
```

## Services Mis à Jour

Les services suivants ont été améliorés avec une gestion d'erreurs appropriée :

- ✅ `menu-components.service.ts`
- ✅ `ingredients.service.ts`
- ✅ `packaging.service.ts`

## Codes d'Erreur Prisma Courants

| Code | Description | Code HTTP |
|------|-------------|-----------|
| P2002 | Unique constraint violation | 400 |
| P2003 | Foreign key constraint violation | 400 |
| P2025 | Record not found | 404 |
| P2016 | Query interpretation error | 400 |
| P2021 | Table does not exist | 500 |
| P2024 | Connection timeout | 500 |

## Bonnes Pratiques

1. **Toujours logger les erreurs** avec `this.logger.error()` avant de les relancer
2. **Messages d'erreur clairs** : Indiquer exactement ce qui ne va pas
3. **Ne pas exposer les détails techniques** dans les messages d'erreur utilisateur
4. **Utiliser le bon code HTTP** : 400 pour client, 404 pour not found, 500 pour serveur
5. **Valider en amont** : Utiliser les DTOs et class-validator pour éviter les erreurs Prisma

## ValidationPipe Configuration

Le `ValidationPipe` global est configuré pour :
- `whitelist: true` - Supprime les propriétés non décorées
- `forbidNonWhitelisted: false` - Accepte les champs supplémentaires (les ignore)
- `transform: true` - Transforme automatiquement les types

Cela permet au frontend d'envoyer des champs supplémentaires qui seront ignorés sans causer d'erreur 400.
