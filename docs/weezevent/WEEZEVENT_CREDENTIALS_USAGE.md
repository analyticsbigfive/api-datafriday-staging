# Weezevent Credentials - Usage Examples

## Configuration Initiale

### 1. Ajouter la clé de chiffrement

Ajoutez cette ligne à `envFiles/.env.development` :

```bash
# Encryption Key (REQUIRED for Weezevent credentials)
ENCRYPTION_KEY="4bfc064558c783c5ea7ecd12d7a215fa1ccf4cd53299e89ab2019ae7f02822ba"
```

> **Note**: Cette clé a été générée automatiquement. Pour production, générez une nouvelle clé avec :
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### 2. Appliquer la migration

```bash
# Option 1: Script automatique
./scripts/migrate-weezevent.sh

# Option 2: Commandes manuelles
make supabase-up
make dev-migrate  # Entrez: add_weezevent_credentials
make dev-down
make dev-up
```

## Utilisation des Endpoints

### Configurer Weezevent pour un Tenant

**Endpoint:** `PATCH /onboarding/tenants/:tenantId/weezevent`

**Exemple avec curl:**

```bash
curl -X PATCH http://localhost:3000/onboarding/tenants/clt1234567890/weezevent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "weezeventClientId": "app_eat-is-family-datafriday_faiafatmtd5kkdbv",
    "weezeventClientSecret": "vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF",
    "weezeventEnabled": true
  }'
```

**Réponse:**

```json
{
  "id": "clt1234567890",
  "name": "Eat is Family",
  "slug": "eat-is-family",
  "weezeventClientId": "app_eat-is-family-datafriday_faiafatmtd5kkdbv",
  "weezeventEnabled": true
}
```

### Récupérer la Configuration (Public)

**Endpoint:** `GET /onboarding/tenants/:tenantId/weezevent`

**Exemple avec curl:**

```bash
curl http://localhost:3000/onboarding/tenants/clt1234567890/weezevent \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Réponse:**

```json
{
  "clientId": "app_eat-is-family-datafriday_faiafatmtd5kkdbv",
  "enabled": true,
  "configured": true
}
```

> **Sécurité**: Le `clientSecret` n'est jamais exposé via l'API.

## Utilisation dans le Code

### Récupérer les Credentials Déchiffrés (Usage Interne)

```typescript
import { OnboardingService } from './features/onboarding/onboarding.service';

@Injectable()
export class WeezeventService {
  constructor(private onboardingService: OnboardingService) {}

  async fetchTransactions(tenantId: string) {
    // Récupérer les credentials déchiffrés
    const config = await this.onboardingService.getWeezeventConfig(tenantId);
    
    if (!config || !config.enabled) {
      throw new Error('Weezevent not configured for this tenant');
    }

    // Utiliser les credentials pour l'API Weezevent
    const response = await fetch('https://api.weezevent.com/transactions', {
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken(config)}`,
      },
    });

    return response.json();
  }

  private async getAccessToken(config: { clientId: string; clientSecret: string }) {
    // Authentification OAuth2 avec Weezevent
    const response = await fetch('https://api.weezevent.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    const data = await response.json();
    return data.access_token;
  }
}
```

### Exemple avec Intercepteur Tenant

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { OnboardingService } from './features/onboarding/onboarding.service';

@Injectable()
export class WeezeventConfigInterceptor implements NestInterceptor {
  constructor(private onboardingService: OnboardingService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;

    if (tenantId) {
      // Injecter la config Weezevent dans la requête
      const weezeventConfig = await this.onboardingService.getWeezeventConfig(tenantId);
      request.weezeventConfig = weezeventConfig;
    }

    return next.handle();
  }
}
```

## Tests

### Test Unitaire - EncryptionService

```typescript
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './core/encryption/encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should encrypt and decrypt correctly', () => {
    const plaintext = 'vBevODCIZxR7XEO5sIZ5KnWpnZda2yiF';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(encrypted);

    expect(encrypted).not.toBe(plaintext);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for same plaintext', () => {
    const plaintext = 'secret';
    const encrypted1 = service.encrypt(plaintext);
    const encrypted2 = service.encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2); // Different IV
    expect(service.decrypt(encrypted1)).toBe(plaintext);
    expect(service.decrypt(encrypted2)).toBe(plaintext);
  });
});
```

### Test d'Intégration - Endpoints

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './app.module';

describe('Weezevent Credentials (e2e)', () => {
  let app: INestApplication;
  let tenantId: string;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Setup: Create tenant and get auth token
    // ... (implementation depends on your auth setup)
  });

  it('should configure Weezevent credentials', () => {
    return request(app.getHttpServer())
      .patch(`/onboarding/tenants/${tenantId}/weezevent`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        weezeventClientId: 'test_client_id',
        weezeventClientSecret: 'test_client_secret',
        weezeventEnabled: true,
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.weezeventClientId).toBe('test_client_id');
        expect(res.body.weezeventEnabled).toBe(true);
        expect(res.body.weezeventClientSecret).toBeUndefined(); // Never exposed
      });
  });

  it('should retrieve Weezevent config (public)', () => {
    return request(app.getHttpServer())
      .get(`/onboarding/tenants/${tenantId}/weezevent`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.clientId).toBe('test_client_id');
        expect(res.body.enabled).toBe(true);
        expect(res.body.configured).toBe(true);
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

## Vérification en Base de Données

### Vérifier le Chiffrement

```bash
# Ouvrir psql
make supabase-psql
```

```sql
-- Vérifier qu'un tenant a une config Weezevent
SELECT 
  id,
  name,
  "weezeventClientId",
  "weezeventEnabled",
  LENGTH("weezeventClientSecret") as secret_length,
  LEFT("weezeventClientSecret", 20) as secret_preview
FROM "Tenant"
WHERE "weezeventClientId" IS NOT NULL;
```

**Résultat attendu:**
```
 id          | name           | weezeventClientId                        | weezeventEnabled | secret_length | secret_preview
-------------+----------------+------------------------------------------+------------------+---------------+-------------------
 clt1234567  | Eat is Family  | app_eat-is-family-datafriday_faiafatm... | t                | 130           | a1b2c3d4e5f6g7h8i9j0
```

Le `weezeventClientSecret` doit être une longue chaîne chiffrée (format: `iv:authTag:encryptedData`).

## Troubleshooting

### Erreur: "ENCRYPTION_KEY must be 64 hex characters"

**Solution:**
```bash
# Générer une nouvelle clé
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Ajouter à envFiles/.env.development
ENCRYPTION_KEY="<la_cle_generee>"
```

### Erreur: "Weezevent configuration not found"

Le tenant n'a pas encore de configuration Weezevent. Utilisez l'endpoint PATCH pour la créer.

### Erreur: "Invalid encrypted text format"

Le secret stocké en base est corrompu ou la clé de chiffrement a changé. Les données chiffrées avec une clé ne peuvent pas être déchiffrées avec une autre clé.

**Solution:** Reconfigurer les credentials Weezevent pour ce tenant.

## Prochaines Étapes

1. **Créer le WeezeventModule** : Module dédié pour interagir avec l'API Weezevent
2. **Implémenter les Webhooks** : Recevoir les événements Weezevent en temps réel
3. **Synchronisation des Données** : Mapper les transactions Weezevent vers votre modèle de données
4. **Monitoring** : Logger les appels API et gérer les erreurs

Consultez `docs/WEEZEVENT_*.md` pour plus de détails sur l'intégration complète.
