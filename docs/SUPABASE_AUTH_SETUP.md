# 🔐 Authentification Supabase CLI

**Erreur rencontrée :**
```
Access token not provided. Supply an access token by running supabase login 
or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

Le CLI Supabase a besoin d'un **Access Token** pour se connecter à votre compte.

---

## ✅ Méthode 1 : Login Interactif (Recommandé)

### Étapes

```bash
# 1. Ouvrir un shell dans le conteneur Supabase CLI
make supabase-shell

# 2. Dans le shell, lancer la commande de login
supabase login

# 3. Suivre les instructions affichées
```

**Ce qui va se passer :**

1. Le CLI affiche un lien (ex: `https://supabase.com/dashboard/cli/login?token=xxxxx`)
2. Copier ce lien et l'ouvrir dans votre navigateur
3. Vous serez redirigé vers Supabase Dashboard
4. Cliquer **"Authorize"** pour autoriser le CLI
5. Revenir au terminal → Login réussi ✅

**Une fois connecté, relancer :**

```bash
# Dans le shell CLI
supabase link --project-ref alsgdtewqeldrrquypdy

# Ou sortir du shell et utiliser make
exit
make supabase-link
# Entrer : alsgdtewqeldrrquypdy
```

---

## ✅ Méthode 2 : Access Token Manuel

Si la méthode 1 ne fonctionne pas (problème de navigateur, etc.), générez un token manuellement.

### Étape 1 : Générer un Access Token

1. Aller sur **https://app.supabase.com/account/tokens**
2. Cliquer **"Generate new token"**
3. **Name :** `CLI Development` (ou autre nom)
4. **Expiration :** Choisir (ex: 30 days)
5. Cliquer **"Generate token"**
6. **Copier le token** (commence par `sbp_...`)

⚠️ **Important :** Le token n'est affiché qu'une seule fois ! Copiez-le immédiatement.

**Exemple de token :**
```
sbp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

---

### Étape 2 : Ajouter dans `envFiles/.env.development`

Ouvrir le fichier `envFiles/.env.development` et ajouter :

```bash
# Supabase CLI Authentication
SUPABASE_ACCESS_TOKEN=sbp_votre_token_ici
```

**Exemple complet du fichier :**

```bash
NODE_ENV=development
API_PORT=3000

# Database
DATABASE_URL=postgresql://postgres.alsgdtewqeldrrquypdy:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

# Supabase API
SUPABASE_URL=https://alsgdtewqeldrrquypdy.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase CLI
SUPABASE_PROJECT_ID=alsgdtewqeldrrquypdy
SUPABASE_DB_PASSWORD=votre-db-password
SUPABASE_ACCESS_TOKEN=sbp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

---

### Étape 3 : Redémarrer le CLI

```bash
# Arrêter le CLI
docker-compose --profile tools down

# Redémarrer avec les nouvelles variables
make supabase-up

# Lier le projet (sans demander de login cette fois)
make supabase-link
# Entrer : alsgdtewqeldrrquypdy
```

**Résultat attendu :**
```
🔗 Liaison au projet Supabase...
✅ Projet lié
```

---

## 🔍 Vérification

### Test dans le Shell CLI

```bash
# Ouvrir shell
make supabase-shell

# Vérifier que le token est chargé
echo $SUPABASE_ACCESS_TOKEN
# Doit afficher : sbp_...

# Vérifier la connexion
supabase projects list
# Doit afficher vos projets Supabase

# Sortir
exit
```

---

## 🎯 Workflow Complet Recommandé

### Option A : Login Interactif (Une Seule Fois)

```bash
# 1. Shell CLI
make supabase-shell

# 2. Login (ouvre navigateur)
supabase login

# 3. Autoriser dans le navigateur

# 4. Lier projet
supabase link --project-ref alsgdtewqeldrrquypdy

# 5. Sortir
exit

# 6. Appliquer migrations
make supabase-db-push
```

---

### Option B : Token Manuel (Persistant)

```bash
# 1. Générer token sur https://app.supabase.com/account/tokens

# 2. Ajouter dans envFiles/.env.development
SUPABASE_ACCESS_TOKEN=sbp_xxxxx

# 3. Redémarrer CLI
docker-compose --profile tools down
make supabase-up

# 4. Lier projet
make supabase-link
# Entrer : alsgdtewqeldrrquypdy

# 5. Appliquer migrations
make supabase-db-push
```

---

## 🔒 Sécurité

### Token vs Password

- **Access Token** : Pour authentifier le CLI (vous, en tant que développeur)
- **Database Password** : Pour se connecter à la DB PostgreSQL

Les deux sont nécessaires mais servent à des choses différentes.

### Gestion du Token

**À faire :**
- ✅ Générer un token avec expiration (30 days recommandé)
- ✅ Stocker dans `envFiles/.env.development` (fichier ignoré par Git)
- ✅ Régénérer périodiquement

**À NE PAS faire :**
- ❌ Commit le token dans Git
- ❌ Partager le token publiquement
- ❌ Utiliser le même token pour prod/staging/dev

---

## 🆘 Troubleshooting

### "Invalid access token"

```bash
# Régénérer un nouveau token
# https://app.supabase.com/account/tokens

# Révoquer l'ancien (optionnel)
# Mettre à jour dans .env.development
# Redémarrer CLI
```

### "Token expired"

```bash
# Générer un nouveau token avec expiration plus longue
# Mettre à jour SUPABASE_ACCESS_TOKEN
# Redémarrer CLI
```

### Login interactif ne fonctionne pas

```bash
# Le conteneur Docker n'a pas accès au navigateur
# Utiliser la Méthode 2 (Token manuel) à la place
```

### Variable non chargée dans le conteneur

```bash
# Vérifier que le token est dans le bon fichier
cat envFiles/.env.development | grep SUPABASE_ACCESS_TOKEN

# Redémarrer complètement
docker-compose --profile tools down
make supabase-up

# Vérifier dans le conteneur
make supabase-shell
echo $SUPABASE_ACCESS_TOKEN
```

---

## 📚 Ressources

- **Tokens Supabase :** https://app.supabase.com/account/tokens
- **CLI Docs :** https://supabase.com/docs/guides/cli/getting-started
- **Guide complet :** `docs/SUPABASE_CLI.md`

---

## ✅ Checklist

- [ ] Méthode 1 : `supabase login` OU Méthode 2 : Token généré
- [ ] Token ajouté dans `envFiles/.env.development` (si Méthode 2)
- [ ] CLI redémarré : `make supabase-up`
- [ ] Projet lié : `make supabase-link` → `alsgdtewqeldrrquypdy`
- [ ] Migrations appliquées : `make supabase-db-push`
- [ ] Vérification Dashboard : Database → Policies (50+ policies)

---

**Une fois authentifié, vous pourrez gérer vos migrations Supabase !** 🚀
