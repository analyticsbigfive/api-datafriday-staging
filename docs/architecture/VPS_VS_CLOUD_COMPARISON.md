# 🔥 VPS vs Cloud : Quelle Architecture pour une App OUAHO ?

**Objectif:** App performante, scalable, impressionnante  
**Budget:** ~$40/mois  
**Date:** 20 janvier 2026

---

## 🥊 Le Match : VPS vs Cloud Managé

### Comparaison Directe

| Critère | VPS $40/mois | Cloud Optimisé $40/mois |
|---------|--------------|-------------------------|
| **RAM** | 8-16 GB | ~2-4 GB (réparti) |
| **CPU** | 4-8 vCPU | ~2-3 vCPU |
| **Storage** | 200-400 GB SSD | ~10-50 GB |
| **Bande passante** | 4-10 TB | Illimitée (CDN) |
| **Scaling** | Manuel (vertical) | Auto (horizontal) |
| **Maintenance** | TOI | Managé |
| **Downtime** | Possible | ~0% (multi-region) |
| **Cold start** | 0 | 2-3s possible |
| **Complexité setup** | Haute | Moyenne |
| **Complexité ops** | Haute | Basse |

---

## 💪 Option VPS : Tout sur Une Machine

### Ce que $40/mois te donne

| Provider | RAM | CPU | Storage | Bandwidth |
|----------|-----|-----|---------|-----------|
| **Hetzner** | 16 GB | 4 vCPU | 160 GB NVMe | 20 TB |
| **Contabo** | 16 GB | 6 vCPU | 400 GB SSD | Illimité |
| **Vultr** | 8 GB | 4 vCPU | 160 GB NVMe | 5 TB |
| **DigitalOcean** | 8 GB | 4 vCPU | 160 GB SSD | 5 TB |
| **OVH** | 16 GB | 4 vCPU | 160 GB NVMe | Illimité |

### 🏆 Recommandation VPS : Hetzner CX41 (~$15) + CPX31 (~$15)

```
┌─────────────────────────────────────────────────────────────────┐
│                    VPS HETZNER - $30/mois                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SERVEUR PRINCIPAL                      │    │
│  │                    CX41 - €15/mois                        │    │
│  │                    8GB RAM, 4 vCPU, 160GB                │    │
│  │                                                           │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │    │
│  │  │ NestJS  │ │ Postgres│ │  Redis  │ │ Nginx   │       │    │
│  │  │  API    │ │   DB    │ │ + Bull  │ │ Reverse │       │    │
│  │  │  :3000  │ │  :5432  │ │  :6379  │ │  Proxy  │       │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SERVEUR WORKERS                        │    │
│  │                    CPX11 - €5/mois                        │    │
│  │                    2GB RAM, 2 vCPU                        │    │
│  │                                                           │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │    │
│  │  │  Worker 1   │ │  Worker 2   │ │  Worker 3   │        │    │
│  │  │ Weezevent   │ │  Reports    │ │  Exports    │        │    │
│  │  │   Sync      │ │ Generation  │ │  CSV/Excel  │        │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  + Cloudflare FREE (CDN + SSL + DDoS)                          │
│  + Supabase FREE (Auth + Edge Functions seulement)              │
│  + Hetzner Backup €3/mois                                       │
│                                                                  │
│  TOTAL: ~$35-40/mois                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Docker Compose VPS - Stack Complète

```yaml
# docker-compose.production.yml - VPS Hetzner
version: '3.8'

services:
  # ============ REVERSE PROXY ============
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx_cache:/var/cache/nginx
    depends_on:
      - api
    restart: always
    deploy:
      resources:
        limits:
          memory: 128M

  # ============ API NESTJS ============
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://datafriday:${DB_PASSWORD}@postgres:5432/datafriday
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          memory: 1G

  # ============ WORKERS BULLMQ ============
  worker-sync:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    command: node dist/worker-sync.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://datafriday:${DB_PASSWORD}@postgres:5432/datafriday
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G

  worker-reports:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    command: node dist/worker-reports.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://datafriday:${DB_PASSWORD}@postgres:5432/datafriday
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G

  # ============ POSTGRESQL ============
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=datafriday
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=datafriday
      - PGDATA=/var/lib/postgresql/data/pgdata
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U datafriday"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 3G
        reservations:
          memory: 2G
    # Optimisations PostgreSQL
    command: >
      postgres
      -c shared_buffers=1GB
      -c effective_cache_size=3GB
      -c maintenance_work_mem=256MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c default_statistics_target=100
      -c random_page_cost=1.1
      -c effective_io_concurrency=200
      -c min_wal_size=1GB
      -c max_wal_size=4GB
      -c max_worker_processes=4
      -c max_parallel_workers_per_gather=2
      -c max_parallel_workers=4
      -c max_parallel_maintenance_workers=2

  # ============ REDIS + BULLMQ ============
  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    volumes:
      - redis_data:/data
    restart: always
    deploy:
      resources:
        limits:
          memory: 600M

  # ============ MONITORING (Optionnel) ============
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'
    restart: always
    deploy:
      resources:
        limits:
          memory: 256M

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
    restart: always
    deploy:
      resources:
        limits:
          memory: 256M

volumes:
  postgres_data:
  redis_data:
  nginx_cache:
  prometheus_data:
  grafana_data:
```

### Nginx Config Optimisé

```nginx
# nginx/nginx.conf
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # Compression
    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript;

    # Cache
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=1g inactive=60m;

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    upstream api {
        server api:3000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name api.datafriday.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name api.datafriday.com;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_session_cache shared:SSL:10m;
        ssl_protocols TLSv1.2 TLSv1.3;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        location / {
            limit_req zone=api_limit burst=50 nodelay;
            limit_conn conn_limit 100;

            proxy_pass http://api;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_cache_bypass $http_upgrade;

            # Cache pour endpoints publics
            location ~ ^/api/v1/public/ {
                proxy_pass http://api;
                proxy_cache api_cache;
                proxy_cache_valid 200 5m;
                proxy_cache_use_stale error timeout updating;
                add_header X-Cache-Status $upstream_cache_status;
            }
        }

        # Health check
        location /health {
            proxy_pass http://api;
            access_log off;
        }

        # Grafana (optionnel)
        location /grafana/ {
            proxy_pass http://grafana:3000/;
        }
    }
}
```

### Script de Setup VPS

```bash
#!/bin/bash
# setup-vps.sh - Configuration complète VPS Hetzner

set -e

echo "🚀 Setup VPS DataFriday HEOS"

# 1. Update système
apt update && apt upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# 3. Install tools
apt install -y htop iotop ncdu fail2ban ufw

# 4. Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 6. Swap (important pour 8GB RAM)
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 7. Optimisations système
cat >> /etc/sysctl.conf << EOF
vm.swappiness=10
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
net.core.netdev_max_backlog=65535
fs.file-max=2097152
EOF
sysctl -p

# 8. Clone projet
git clone https://github.com/your-repo/datafriday-api.git /app
cd /app

# 9. Setup environment
cp .env.example .env
# Éditer .env avec les vraies valeurs

# 10. Start services
docker compose -f docker-compose.production.yml up -d

# 11. Setup SSL avec Certbot
apt install -y certbot
certbot certonly --standalone -d api.datafriday.com
cp /etc/letsencrypt/live/api.datafriday.com/* ./nginx/ssl/

# 12. Restart avec SSL
docker compose -f docker-compose.production.yml restart nginx

echo "✅ VPS Setup Complete!"
echo "📊 Dashboard: https://api.datafriday.com/grafana"
```

---

## ☁️ Option Cloud : Distribué et Managé

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUD OPTIMISÉ - $40/mois                     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Cloudflare  │  │   Fly.io     │  │   Supabase   │          │
│  │    FREE      │  │    $15       │  │     $25      │          │
│  │  CDN + WAF   │  │  API + Work  │  │  DB + Edge   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                 │                   │
│         └─────────────────┴─────────────────┘                   │
│                           │                                      │
│                    Multi-région                                  │
│                    Auto-scaling                                  │
│                    0 maintenance                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏆 Verdict : Que Choisir ?

### Choisis **VPS** si :

| Critère | VPS Win |
|---------|---------|
| ✅ Tu veux **contrôle total** | Root access, custom config |
| ✅ Tu as des **compétences DevOps** | Linux, Docker, sécurité |
| ✅ **Données sensibles** (compliance) | Tout sur ton serveur |
| ✅ **Workloads constants** | Pas de scale to zero |
| ✅ Tu veux **plus de RAM/CPU** pour le prix | 16GB > 4GB |
| ✅ **Latence prévisible** | Pas de cold starts |

### Choisis **Cloud** si :

| Critère | Cloud Win |
|---------|-----------|
| ✅ Tu veux **zéro maintenance** | Pas de updates, patches |
| ✅ **Équipe petite** | Focus code, pas ops |
| ✅ **Trafic variable** | Scale to zero = économies |
| ✅ **Haute disponibilité** | Multi-région automatique |
| ✅ **Déploiements fréquents** | CI/CD simple |
| ✅ Tu veux **dormir tranquille** | Pas d'alertes 3AM |

---

## 🎯 Ma Recommandation pour App "OUAHO"

### Option HYBRIDE : Le Meilleur des Deux Mondes 🔥

```
┌─────────────────────────────────────────────────────────────────┐
│                 ARCHITECTURE HYBRIDE OUAHO                       │
│                        ~$45/mois                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CLOUDFLARE FREE          VPS HETZNER CX41           SUPABASE  │
│   ┌──────────────┐         ┌──────────────┐         ┌────────┐ │
│   │     CDN      │────────▶│   NestJS     │────────▶│  Auth  │ │
│   │     WAF      │         │   Postgres   │         │  Edge  │ │
│   │   SSL/TLS    │         │    Redis     │         │ Funcs  │ │
│   │  Rate Limit  │         │   Workers    │         │Realtime│ │
│   │     FREE     │         │    $15/m     │         │  $25   │ │
│   └──────────────┘         └──────────────┘         └────────┘ │
│                                                                  │
│   ✅ Performance max (VPS dédié)                                │
│   ✅ Scaling Edge Functions (Supabase)                          │
│   ✅ CDN mondial (Cloudflare)                                   │
│   ✅ Auth robuste (Supabase)                                    │
│   ✅ WebSocket natif (Supabase Realtime)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pourquoi cette config est OUAHO :

| Feature | Comment c'est OUAHO |
|---------|---------------------|
| **Latence** | < 50ms (cache Nginx + Redis) |
| **Throughput** | 5000+ req/sec sur VPS 8GB |
| **Disponibilité** | Cloudflare = DDoS protection |
| **Real-time** | WebSocket via Supabase |
| **Edge Computing** | Calculs lourds → Supabase Edge |
| **CDN Global** | Assets servis depuis 200+ POPs |
| **Coût** | $40-45/mois tout compris |

---

## 📊 Benchmarks Attendus

### Avec VPS Hetzner CX41 (8GB RAM, 4 vCPU)

| Opération | Latence P50 | Latence P99 | Throughput |
|-----------|-------------|-------------|------------|
| API simple (cache hit) | **8ms** | 25ms | 10,000 rps |
| API simple (cache miss) | **45ms** | 120ms | 2,000 rps |
| Query complexe | **80ms** | 250ms | 500 rps |
| Dashboard analytics | **35ms** | 100ms | 1,000 rps |
| Export 10K rows | 2s | 5s | 50 concurrent |
| Sync Weezevent 50K | 3 min | - | Background |

### Capacité Estimée

| Métrique | Valeur |
|----------|--------|
| Users concurrents | **500-1000** |
| Requests/jour | **1-5 millions** |
| Transactions stockées | **10+ millions** |
| Tenants supportés | **100-500** |

---

## 🚀 Script de Déploiement Final

```bash
#!/bin/bash
# deploy-ouaho.sh

echo "🔥 Deploying OUAHO Architecture"

# 1. Setup VPS (si première fois)
if [ "$1" == "init" ]; then
    ssh root@your-vps "bash -s" < setup-vps.sh
fi

# 2. Deploy application
echo "📦 Building and pushing..."
docker build -t datafriday-api:latest .
docker save datafriday-api:latest | ssh root@your-vps "docker load"

# 3. Update sur VPS
ssh root@your-vps << 'EOF'
    cd /app
    git pull origin main
    docker compose -f docker-compose.production.yml pull
    docker compose -f docker-compose.production.yml up -d --force-recreate
    docker system prune -f
EOF

# 4. Health check
echo "🏥 Health check..."
sleep 10
curl -f https://api.datafriday.com/health || exit 1

# 5. Purge Cloudflare cache
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE}/purge_cache" \
     -H "Authorization: Bearer ${CF_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'

echo "✅ Deployment complete!"
echo "🌐 API: https://api.datafriday.com"
echo "📊 Grafana: https://api.datafriday.com/grafana"
```

---

## 🏁 Conclusion

| Budget $40/mois | Recommandation |
|-----------------|----------------|
| **Solo dev, veut apprendre** | VPS Hetzner seul |
| **Startup, besoin de scale** | Cloud (Fly + Supabase) |
| **App "OUAHO" optimale** | **Hybride VPS + Supabase** ✅ |

**Mon conseil :** Commence avec le **VPS Hetzner + Supabase** (hybride) → tu as la puissance du VPS ET les features managed de Supabase (Auth, Edge, Realtime) pour **~$40/mois** avec des perfs de fou ! 🚀
