# 🧪 Interface de Test Frontend - DataFriday API

Interface frontend légère pour tester facilement toutes les fonctionnalités de l'API DataFriday.

## 🚀 Démarrage Rapide

### Option 1: Serveur Node.js (Recommandé)

```bash
# Depuis le dossier test-frontend
cd test-frontend
node server.js

# Ouvrir dans le navigateur
open http://localhost:8080
```

### Option 2: Serveur Python

```bash
cd test-frontend
python3 -m http.server 8080

# Ouvrir dans le navigateur
open http://localhost:8080
```

### Option 3: Live Server (VS Code Extension)

1. Installer l'extension "Live Server" dans VS Code
2. Clic droit sur `index.html` → "Open with Live Server"

## 📋 Prérequis

1. **API DataFriday** doit être démarrée sur `http://localhost:3000`
   ```bash
   cd /Users/kouameulrich/Projets/api-datafriday
   make dev
   ```

2. **Configuration Supabase** (requis pour l'authentification)
   - Supabase URL: `https://xxx.supabase.co`
   - Supabase Anon Key: `eyJ...`

## 🎯 Fonctionnalités Testables

### ✅ Déjà Implémentées

- [x] **Configuration API** - URL et credentials Supabase
- [x] **Authentification** - Inscription et connexion via Supabase
- [x] **Profile (/me)** - Récupération profil utilisateur
- [x] **Onboarding** - Création d'organisation/tenant
- [x] **Configuration Weezevent** - Setup credentials Weezevent
- [x] **Synchronisation Weezevent** - Events, Products, Transactions
- [x] **Consultation Données** - Voir les données synchronisées
- [x] **Health Check** - Vérifier status de l'API
- [x] **Console Logs** - Tous les appels et réponses

## 📖 Guide d'Utilisation

### 1. Configuration Initiale

1. Ouvrir l'interface: `http://localhost:8080`
2. Remplir les credentials Supabase (section Configuration)
3. Vérifier l'API avec "Health Check"

### 2. Authentification

**Option A: Créer un compte**
1. Aller dans l'onglet "Inscription"
2. Remplir email, mot de passe, prénom, nom
3. Cliquer sur "S'inscrire"
4. Vérifier l'email de confirmation (dev: vérifier les logs Supabase)

**Option B: Se connecter**
1. Onglet "Connexion"
2. Entrer email et mot de passe
3. Cliquer sur "Se connecter"

### 3. Récupérer le Profil

1. Cliquer sur "Récupérer mes infos" dans la section "Mon Profil"
2. Le Tenant ID sera auto-rempli si vous avez déjà une organisation

### 4. Créer une Organisation (Onboarding)

1. Section "Onboarding"
2. Remplir:
   - Nom: "Mon Restaurant Test"
   - Slug: "mon-restaurant-test" (unique, lowercase, tirets)
3. Cliquer sur "Créer l'organisation"
4. Le Tenant ID sera auto-rempli

### 5. Configurer Weezevent

1. Section "Configuration Weezevent"
2. Remplir:
   - Tenant ID (auto-rempli depuis /me)
   - Client ID Weezevent: `app_...`
   - Client Secret: `secret_...`
   - Organization ID: `182509` (ou votre org ID)
3. Cliquer sur "Configurer Weezevent"

### 6. Synchroniser les Données

1. Section "Synchronisation Weezevent"
2. Cliquer sur:
   - "Sync Events" - Synchroniser les événements
   - "Sync Products" - Synchroniser les produits
   - "Sync Transactions" - Synchroniser les transactions
3. Voir le status avec "Voir le status"

### 7. Consulter les Données

1. Section "Données Weezevent"
2. Cliquer sur:
   - "Voir Events"
   - "Voir Products"
   - "Voir Transactions"

## 🎨 Interface

L'interface comprend:
- **Header** - Titre et description
- **Configuration** - URL API et credentials Supabase
- **Authentification** - Login/Register avec onglets
- **Mon Profil** - Endpoint /me
- **Onboarding** - Création organisation
- **Configuration Weezevent** - Setup intégration
- **Synchronisation** - Sync manuelle
- **Données Weezevent** - Consultation
- **Health Check** - Status API
- **Console** - Logs en temps réel

## 🔧 Personnalisation

### Modifier l'URL de l'API

```javascript
// Dans index.html, ligne ~30
<input type="text" id="apiUrl" value="http://localhost:3000/api/v1" />
```

### Ajouter un Nouvel Endpoint

1. **Ajouter l'UI dans `index.html`:**
```html
<section class="card">
    <h2>🆕 Mon Endpoint</h2>
    <button class="btn btn-primary" onclick="monEndpoint()">Tester</button>
    <div class="result" id="monResult"></div>
</section>
```

2. **Ajouter la fonction dans `app.js`:**
```javascript
async function monEndpoint() {
    try {
        const data = await apiCall('/mon-endpoint');
        log('success', '✅ Succès', data);
        showResult('monResult', data);
    } catch (error) {
        log('error', '❌ Erreur', error);
        showResult('monResult', { error: error.message }, false);
    }
}
```

## 🗑️ Suppression

Pour supprimer cette interface de test plus tard:

```bash
# Supprimer tout le dossier
rm -rf test-frontend/

# Ou ajouter au .gitignore
echo "test-frontend/" >> .gitignore
```

## 🐛 Troubleshooting

### L'API ne répond pas
```bash
# Vérifier que l'API est démarrée
curl http://localhost:3000/api/v1/health

# Si erreur, redémarrer l'API
cd /Users/kouameulrich/Projets/api-datafriday
make dev
```

### Erreur CORS
- L'API doit autoriser les requêtes depuis `http://localhost:8080`
- Vérifier la config CORS dans `main.ts`

### Erreur Supabase
- Vérifier que les credentials sont corrects
- Ouvrir la console navigateur (F12) pour voir les erreurs détaillées

### Token expiré
- Se déconnecter et se reconnecter
- Effacer le localStorage: `localStorage.clear()` dans la console

## 📊 Console de Logs

Tous les appels API et réponses sont loggés dans la console en bas de page:
- 🟢 **Vert** - Succès
- 🔴 **Rouge** - Erreur
- 🔵 **Bleu** - Info
- 🟡 **Jaune** - Warning

## 🔒 Sécurité

**⚠️ ATTENTION:** Cette interface est pour le développement uniquement!

- Ne JAMAIS utiliser en production
- Ne JAMAIS committer les credentials
- Supprimer après les tests

## 📝 Notes

- Interface 100% vanilla JS (pas de framework)
- Utilise Supabase JS Client via CDN
- Compatible tous navigateurs modernes
- Responsive design
- Facile à supprimer

---

**Créé le:** 10 Décembre 2025  
**Usage:** Test & Développement uniquement  
**À supprimer:** Après validation des fonctionnalités
