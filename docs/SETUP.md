# ⚙️ Setup Guide

## Prerequisites

- Docker >= 24.x
- Docker Compose >= 2.x
- Supabase account

---

## 1. Environment Configuration

### Create environment file

```bash
cp envFiles/.env.example envFiles/.env.development
```

### Required variables

```bash
# Database Connection (from Supabase Dashboard)
DATABASE_URL="postgresql://postgres.[project-id]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-id]:[password]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

# Supabase
SUPABASE_URL="https://[project-id].supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_PROJECT_ID="[project-id]"

# JWT (from Supabase Settings > API > JWT Secret)
JWT_SECRET="your-supabase-jwt-secret"
JWT_EXPIRES_IN="7d"

# Application
NODE_ENV="development"
PORT="3000"
CORS_ORIGIN="*"
```

---

## 2. Start Application

```bash
# Start containers
docker-compose --env-file envFiles/.env.development up -d

# Check logs
docker-compose logs -f api-dev
```

---

## 3. Run Migrations

```bash
# Generate Prisma client
docker-compose exec api-dev npx prisma generate

# Run migrations
docker-compose exec api-dev npx prisma migrate deploy
```

---

## 4. Verify Installation

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Expected response:
# {
#   "status": "ok",
#   "message": "API is running"
# }
```

---

## Common Commands

```bash
# Start
docker-compose --env-file envFiles/.env.development up -d

# Stop
docker-compose --env-file envFiles/.env.development down

# Logs
docker-compose logs -f api-dev

# Tests
docker-compose exec api-dev npm test

# Prisma Studio
docker-compose exec api-dev npx prisma studio
```

---

## Troubleshooting

### Port 3000 already in use
```bash
# Change PORT in .env file
PORT=3001
```

### Database connection error
- Verify DATABASE_URL and DIRECT_URL
- Check Supabase project is active
- Verify credentials

### JWT errors
- Add JWT_SECRET from Supabase Dashboard
- Settings > API > JWT Secret
