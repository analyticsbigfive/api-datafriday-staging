# DataFriday Frontend - Vue.js

Application frontend Vue.js pour l'API DataFriday.

## 🚀 Quick Start

### Développement Local

```bash
# Installer les dépendances
npm install

# Démarrer le serveur de développement
npm run dev

# L'application sera disponible sur http://localhost:5173
```

### Avec Docker

```bash
# Depuis la racine du projet
docker-compose --profile frontend up -d

# L'application sera disponible sur http://localhost:5173
```

## 📁 Structure

```
frontend/
├── src/
│   ├── assets/          # CSS et ressources
│   ├── components/      # Composants Vue réutilisables
│   ├── config/          # Configuration
│   ├── lib/             # Librairies (API, Supabase)
│   ├── router/          # Vue Router
│   ├── stores/          # Pinia stores
│   ├── views/           # Pages/Vues
│   ├── App.vue          # Composant racine
│   └── main.js          # Point d'entrée
├── public/              # Fichiers statiques
├── .env                 # Variables d'environnement
├── Dockerfile           # Docker config
└── vite.config.js       # Vite config
```

## 🔧 Configuration

Le frontend utilise automatiquement les variables du fichier **`envFiles/.env.development`** à la racine du projet.

Variables utilisées :
- `SUPABASE_URL` → `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON_KEY`
- `API_PORT` → URL de l'API (par défaut: `http://localhost:3001/api/v1`)

**Aucun fichier `.env` n'est nécessaire dans le dossier `frontend/`.**

## 📱 Pages

| Route | Description |
|-------|-------------|
| `/login` | Connexion |
| `/register` | Inscription |
| `/dashboard` | Tableau de bord |
| `/tenants` | Gestion des tenants |
| `/weezevent` | Intégration Weezevent |
| `/profile` | Profil utilisateur |
| `/api-test` | Console de test API |

## 🛠️ Technologies

- **Vue.js 3** - Framework JavaScript
- **Vue Router** - Routing SPA
- **Pinia** - State management
- **Tailwind CSS** - Styling
- **Axios** - HTTP client
- **Supabase JS** - Auth client
- **Vite** - Build tool

## 🐳 Docker

### Build Production

```bash
docker build -t datafriday-frontend --target production .
docker run -p 80:80 datafriday-frontend
```

### Build Development

```bash
docker build -t datafriday-frontend-dev --target development .
docker run -p 5173:5173 -v $(pwd)/src:/app/src datafriday-frontend-dev
```
