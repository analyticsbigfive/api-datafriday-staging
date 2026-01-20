# 🚀 Development Guide

## Phase 1: Core Infrastructure ✅ COMPLETE

### Phase 1.1: Database & Tenant Context
**Files:** `src/core/database/`, `src/shared/interfaces/`

**Features:**
- PrismaService with logging, transactions, retry
- TenantInterceptor for automatic multi-tenant isolation
- Tenant-aware interfaces

**Tests:** 12 passed ✅

---

### Phase 1.2: Authentication & Authorization
**Files:** `src/core/auth/`

**Features:**
- JWT Strategy for Supabase token validation
- Guards: JwtGuard, RolesGuard
- Decorators: @CurrentUser(), @CurrentTenant(), @Roles()

**Tests:** 6 passed ✅

**Usage:**
```typescript
@Controller('users')
@UseGuards(JwtGuard, RolesGuard)
export class UsersController {
  @Get()
  @Roles('ADMIN', 'MANAGER')
  findAll(@CurrentUser() user, @CurrentTenant() tenantId) {
    return this.usersService.findAll(tenantId);
  }
}
```

---

### Phase 1.3: Exception Handling & Validation
**Files:** `src/core/exceptions/`, `src/core/pipes/`

**Features:**
- Global exception filter (standardized error responses)
- Custom domain exceptions
- DTO validation pipe

**Tests:** 9 passed ✅

**Usage:**
```typescript
// Throw anywhere
throw new NotFoundException('User', 'user-123');

// Automatic response:
// {
//   "statusCode": 404,
//   "message": "User with identifier 'user-123' not found",
//   "timestamp": "2024-11-14T...",
//   "path": "/api/v1/users/user-123"
// }
```

---

## Phase 2: Features (Next)

### Feature Structure

```
src/features/[feature-name]/
├── commands/              # CQRS Commands
│   ├── create-[entity].command.ts
│   └── create-[entity].handler.ts
├── queries/               # CQRS Queries
│   ├── get-[entity].query.ts
│   └── get-[entity].handler.ts
├── dto/                   # Data Transfer Objects
│   ├── create-[entity].dto.ts
│   └── update-[entity].dto.ts
├── [feature].controller.ts
├── [feature].service.ts
├── [feature].module.ts
└── tests/
    ├── [feature].controller.spec.ts
    └── [feature].service.spec.ts
```

### Planned Features

1. **TENANTS** - CRUD + onboarding
2. **USERS** - Management + permissions
3. **SPACES** - Venue management
4. **MENU-ITEMS** - Catalog + costs
5. **INGREDIENTS** - Stock management
6. **SUPPLIERS** - Supplier management

---

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/tenants
```

### 2. Generate Module

```bash
# Inside container
docker-compose exec api-dev nest g module features/tenants
docker-compose exec api-dev nest g controller features/tenants
docker-compose exec api-dev nest g service features/tenants
```

### 3. Create DTOs

```typescript
// src/features/tenants/dto/create-tenant.dto.ts
import { IsString, IsEmail, IsNotEmpty } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;
}
```

### 4. Implement Service

```typescript
// src/features/tenants/tenants.service.ts
@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: dto,
    });
  }
}
```

### 5. Implement Controller

```typescript
// src/features/tenants/tenants.controller.ts
@Controller('tenants')
@UseGuards(JwtGuard)
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }
}
```

### 6. Write Tests

```typescript
// src/features/tenants/tests/tenants.service.spec.ts
describe('TenantsService', () => {
  it('should create a tenant', async () => {
    const dto = { name: 'Test', email: 'test@example.com' };
    const result = await service.create(dto);
    expect(result).toBeDefined();
  });
});
```

### 7. Run Tests

```bash
docker-compose exec api-dev npm test
```

---

## Code Standards

### TypeScript
- Use strict type checking
- No `any` types
- Interfaces for all data structures

### NestJS
- Use dependency injection
- One responsibility per class
- Use decorators appropriately

### Testing
- Unit tests for services
- Integration tests for controllers
- E2E tests for critical flows
- Minimum 80% coverage

### Naming
- PascalCase for classes
- camelCase for variables/functions
- kebab-case for files
- UPPER_CASE for constants

---

## Git Workflow

```bash
# 1. Create feature branch
git checkout -b feature/your-feature

# 2. Make changes and test
docker-compose exec api-dev npm test

# 3. Commit with conventional commits
git commit -m "feat(tenants): add create tenant endpoint"

# 4. Push and create PR
git push origin feature/your-feature
```

### Commit Types
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `test:` Tests
- `refactor:` Code refactoring
- `chore:` Maintenance

---

## Testing

### Unit Tests

```bash
# Run all tests
docker-compose exec api-dev npm test

# Run specific test file
docker-compose exec api-dev npm test -- tenants.service.spec.ts

# With coverage
docker-compose exec api-dev npm run test:cov
```

### E2E Tests

```bash
docker-compose exec api-dev npm run test:e2e
```

---

## Debugging

### Logs

```bash
# Application logs
docker-compose logs -f api-dev

# Database queries (Prisma)
# Set in .env: DATABASE_URL="...?connection_limit=5&pool_timeout=10&log_queries=true"
```

### Prisma Studio

```bash
docker-compose exec api-dev npx prisma studio
```

Open: http://localhost:5555
