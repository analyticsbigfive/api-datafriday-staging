import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './core/exceptions/all-exceptions.filter';
import { ValidationPipe } from './core/pipes/validation.pipe';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ 
      logger: true,
      // P2: Connection pooling optimization
      connectionTimeout: 30000,
      keepAliveTimeout: 65000,
    }),
  );

  // P0: Security headers (Helmet)
  await app.register(helmet as any, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // P2: Response compression
  await app.register(compress as any, {
    encodings: ['gzip', 'deflate'],
    threshold: 1024, // Only compress responses > 1KB
  });

  // Global exception filter for standardized error responses
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe for automatic DTO validation
  app.useGlobalPipes(new ValidationPipe());

  // P0: CORS configuration (strict in production)
  const allowedOrigins = process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];
  
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' 
      ? allowedOrigins
      : true, // Allow all in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('DataFriday API')
    .setDescription(`
## API Multi-tenant pour la gestion d'événements et l'intégration Weezevent

### 🔐 Authentification
L'API utilise **Supabase Auth** pour l'authentification. Après connexion via Supabase, incluez le JWT token dans le header:
\`\`\`
Authorization: Bearer <votre_token_jwt>
\`\`\`

### 🏢 Multi-tenant
Chaque utilisateur appartient à une organisation (tenant). Le tenant est automatiquement déterminé à partir du token JWT.

### 📋 Endpoints publics (sans auth)
- \`GET /api/v1/health\` - Status de l'API

### 🔑 Onboarding (auth Supabase requise, pas de tenant)
- \`GET /api/v1/onboarding/status\` - Vérifier si l'utilisateur existe en DB
- \`POST /api/v1/onboarding\` - Créer une organisation
- \`POST /api/v1/onboarding/join-by-code\` - Rejoindre via code d'invitation

### 🛡️ Endpoints protégés (auth + tenant requis)
Tous les autres endpoints nécessitent un utilisateur lié à un tenant.
    `)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT Supabase',
      },
      'supabase-jwt',
    )
    .addTag('Health', 'Vérification du status de l\'API')
    .addTag('Onboarding', 'Création de compte et organisation')
    .addTag('Tenants', 'Gestion des organisations (admin)')
    .addTag('Users', 'Gestion des utilisateurs')
    .addTag('Me', 'Profil utilisateur courant')
    .addTag('Spaces', 'Gestion des espaces/établissements')
    .addTag('Weezevent', 'Intégration Weezevent')
    .addTag('Organizations', 'Gestion de l\'organisation courante')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'DataFriday API Documentation',
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
  console.log(`📚 API Documentation available at: http://localhost:${port}/docs`);
  console.log(`🔒 Security: Helmet enabled, CORS configured`);
  console.log(`⚡ Performance: Compression enabled, Connection pooling optimized`);
  console.log(`🛡️  Rate limiting: 20 req/s, 300 req/min, 5000 req/h per tenant`);
}

bootstrap();
