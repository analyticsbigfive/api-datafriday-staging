#!/bin/bash
# ===========================================
# Script de configuration initiale du serveur VPS
# À exécuter une seule fois lors du setup
# ===========================================

set -e

echo "🚀 Configuration du serveur DataFriday..."

# Variables
APP_DIR="/opt/datafriday"
GITHUB_REPO="votre-org/api-datafriday-staging"  # À modifier

# 1. Installer Docker si pas présent
if ! command -v docker &> /dev/null; then
    echo "📦 Installation de Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "⚠️  Déconnectez-vous et reconnectez-vous pour appliquer les permissions Docker"
fi

# 2. Installer Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installation de Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 3. Créer le répertoire de l'application
echo "📁 Création du répertoire $APP_DIR..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR
cd $APP_DIR

# 4. Créer le fichier .env
echo "📝 Création du fichier .env..."
cat > .env << 'EOF'
# ===========================================
# DataFriday Staging Environment
# ===========================================

# GitHub Container Registry
GITHUB_REPOSITORY=votre-org/api-datafriday-staging

# Database (Supabase)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxx:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres

# Supabase
SUPABASE_URL=https://alsgdtewqeldrrquypdy.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Security
JWT_SECRET=your-jwt-secret-from-supabase
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# CORS
CORS_ORIGINS=https://staging.datafriday.com,http://localhost:3000

EOF

echo "⚠️  IMPORTANT: Éditez le fichier $APP_DIR/.env avec vos vraies valeurs!"

# 5. Télécharger le docker-compose
echo "📥 Téléchargement du docker-compose..."
curl -fsSL "https://raw.githubusercontent.com/$GITHUB_REPO/main/docker-compose.server.yml" -o docker-compose.staging.yml

# 6. Login au GitHub Container Registry
echo "🔐 Configuration de l'accès au registry..."
echo "Exécutez: docker login ghcr.io -u VOTRE_USERNAME"

# 7. Créer le service systemd (optionnel)
echo "⚙️  Création du service systemd..."
sudo tee /etc/systemd/system/datafriday.service > /dev/null << EOF
[Unit]
Description=DataFriday API
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose -f docker-compose.staging.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.staging.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable datafriday

echo ""
echo "✅ Configuration terminée!"
echo ""
echo "📋 Prochaines étapes:"
echo "   1. Éditez $APP_DIR/.env avec vos vraies valeurs"
echo "   2. Connectez-vous au registry: docker login ghcr.io"
echo "   3. Démarrez l'application: cd $APP_DIR && docker-compose -f docker-compose.staging.yml up -d"
echo ""
echo "🔐 N'oubliez pas de configurer les secrets GitHub:"
echo "   - SSH_HOST: IP ou hostname du serveur"
echo "   - SSH_USER: utilisateur SSH"
echo "   - SSH_PRIVATE_KEY: clé SSH privée"
echo "   - SUPABASE_ACCESS_TOKEN: token Supabase CLI"
echo "   - SUPABASE_PROJECT_ID: ID du projet Supabase"
