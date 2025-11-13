# 📚 Documentation

## Fichiers

### [ARCHITECTURE.md](./ARCHITECTURE.md)
Architecture multi-tenant SaaS, stack technique, modèles de données (27), sécurité RLS, workflow de développement.

### [ENVIRONMENTS.md](./ENVIRONMENTS.md)
Guide complet des 3 environnements Supabase (Development, Staging, Production). Configuration, commandes, workflow, migrations.

### [figma.md](./figma.md)
Données sources extraites de Figma. Référence pour comprendre la structure des données métier.

### [prisma.md](./prisma.md)
Notes et documentation Prisma. Références techniques sur l'ORM.

---

## Quick Links

- **Setup initial:** Voir [ENVIRONMENTS.md](./ENVIRONMENTS.md#setup-initial)
- **Commandes:** `make help` dans le terminal
- **Architecture SaaS:** [ARCHITECTURE.md#architecture-multi-tenant-saas](./ARCHITECTURE.md#architecture-multi-tenant-saas)
- **Modèles:** Voir `../prisma/schema.prisma`

---

## Structure du projet

```
api-datafriday/
├── README.md              ← Documentation principale
├── docs/                  ← Documentation technique
│   ├── ARCHITECTURE.md
│   ├── ENVIRONMENTS.md
│   ├── figma.md
│   └── prisma.md
├── prisma/
│   ├── schema.prisma      ← 27 modèles
│   ├── migrations/
│   └── seed.ts
├── src/
│   └── ...
└── Makefile              ← 50+ commandes
```
