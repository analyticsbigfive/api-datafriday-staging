# 🚀 DataFriday API

**Multi-tenant SaaS Platform** - NestJS + Fastify + Prisma + Supabase

[![Status](https://img.shields.io/badge/Status-Production_Ready-green)]()
[![Phase](https://img.shields.io/badge/Phase-1_Complete-blue)]()
[![Tests](https://img.shields.io/badge/Tests-24/25_Passed-success)]()

---

## 📊 Current Status

**Phase 1: Core Infrastructure** ✅ **COMPLETE**

```
✅ Multi-tenant Architecture
✅ JWT Authentication & RBAC
✅ Global Error Handling
✅ DTO Validation
✅ Health Check Endpoints
✅ 24 Unit Tests Passing
✅ Complete Documentation
```

**API Running:** http://localhost:3000/api/v1  
**Health Check:** http://localhost:3000/api/v1/health

---

## 📚 Documentation

**[`docs/INDEX.md`](./docs/INDEX.md)** - Documentation index

**Essential Guides:**
- 🚀 [Setup Guide](./docs/SETUP.md) - Installation & configuration
- 💾 [Database Guide](./docs/DATABASE.md) - Schema & migrations
- 🏗️ [Architecture](./docs/ARCHITECTURE.md) - System design
- 👨‍💻 [Development](./docs/DEVELOPMENT.md) - Coding standards

---

## 🛠️ Tech Stack

**Backend:**
- **NestJS** - Progressive Node.js framework
- **Fastify** - Fast web framework
- **Prisma** - Next-generation ORM
- **Supabase** - PostgreSQL database with RLS

**Architecture:**
- Multi-tenant with automatic tenant isolation
- CQRS pattern ready
- Feature-first structure
- Clean code & DDD principles

**Testing:**
- Jest - Unit & Integration tests
- 96% test coverage on core

---

## ⚡ Quick Start

### Prerequisites

- Docker >= 24.x
- Docker Compose >= 2.x

**No need for Node.js, npm, or PostgreSQL on your machine.**

### 1. Clone & Configure

```bash
# Clone the repository
git clone <your-repo>
cd api-datafriday

# Configure environment
cp envFiles/.env.example envFiles/.env.development
# Edit envFiles/.env.development with your Supabase credentials
```

### 2. Start the Application

```bash
# Start containers
docker-compose --env-file envFiles/.env.development up -d

# Check logs
docker-compose logs -f api-dev
```

### 3. Verify

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Response:
# {
#   "status": "ok",
#   "message": "API is running",
#   "version": "1.0.0"
# }
```

**API is ready:** http://localhost:3000/api/v1

---

## 📁 Project Structure

```
api-datafriday/
├── src/
│   ├── core/                      # Core Infrastructure
│   │   ├── database/              # Prisma & Tenant
│   │   ├── auth/                  # JWT & RBAC
│   │   ├── exceptions/            # Error Handling
│   │   └── pipes/                 # Validation
│   ├── health/                    # Health Checks
│   ├── features/                  # Feature Modules (Phase 2)
│   └── shared/                    # Shared Interfaces
│
├── prisma/
│   ├── schema.prisma              # 27 Data Models
│   └── migrations/                # Prisma Migrations
│
├── supabase/
│   └── migrations/                # RLS Policies
│
├── docs/                          # Complete Documentation
│   ├── INDEX.md                   # Documentation Index
│   ├── status/                    # Project Status
│   ├── phases/                    # Completed Phases
│   ├── architecture/              # Architecture Docs
│   ├── database/                  # Database Guides
│   └── setup/                     # Setup Guides
│
└── envFiles/                      # Environment Configs
    ├── .env.example
    └── .env.development
```

---

## 🔧 Common Commands

```bash
# Development
docker-compose --env-file envFiles/.env.development up -d    # Start
docker-compose --env-file envFiles/.env.development down     # Stop
docker-compose logs -f api-dev                               # View logs

# Tests
docker-compose exec api-dev npm test                         # Run tests
docker-compose exec api-dev npm run test:cov                 # With coverage

# Database
docker-compose exec api-dev npx prisma studio                # Prisma Studio
docker-compose exec api-dev npx prisma migrate dev           # Create migration

# Build
docker-compose exec api-dev npm run build                    # Build
docker-compose exec api-dev npm run lint                     # Lint
```

---

## 🏗️ Architecture Highlights

### Multi-Tenant Isolation

Every request automatically includes tenant context:

```typescript
@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    // Automatically filtered by tenant
    return this.usersService.findAll(tenantId);
  }
}
```

### Role-Based Access Control

```typescript
@Controller('admin')
@UseGuards(JwtGuard, RolesGuard)
export class AdminController {
  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(@CurrentUser() user, @Body() dto) {
    // Only ADMIN or MANAGER can access
  }
}
```

### Global Error Handling

```typescript
// Throw anywhere
throw new NotFoundException('User', 'user-123');

// Standardized response
{
  "statusCode": 404,
  "message": "User with identifier 'user-123' not found",
  "timestamp": "2024-11-14T...",
  "path": "/api/v1/users/user-123"
}
```

---

## 🧪 Testing

```bash
# Run all tests
docker-compose exec api-dev npm test

# Current results:
# Test Suites: 4 passed, 2 skipped, 6 total
# Tests:       24 passed, 1 skipped, 25 total
# Coverage:    96% on core modules
```

---

## 🚀 Next Steps (Phase 2)

**Feature Development:**
- [ ] Feature TENANTS - CRUD + onboarding
- [ ] Feature USERS - Management + permissions
- [ ] Feature SPACES - Venue management
- [ ] Feature MENU-ITEMS - Catalog + costs
- [ ] Feature INGREDIENTS - Stock management

See [DEVELOPMENT.md](./docs/DEVELOPMENT.md) for implementation details.

---

## 📖 Documentation

See [`docs/INDEX.md`](./docs/INDEX.md) for complete documentation.

**Essential:**
- [SETUP.md](./docs/SETUP.md) - Get started
- [DATABASE.md](./docs/DATABASE.md) - Schema & Prisma
- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) - Coding guide

---

## 📝 License

MIT License

---

**Built with ❤️ using NestJS, Fastify, Prisma, and Supabase**
