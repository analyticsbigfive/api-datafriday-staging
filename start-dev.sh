#!/bin/bash

# Script pour démarrer l'API et le Frontend DataFriday

echo "🚀 Démarrage de DataFriday..."
echo ""

# Fonction pour gérer Ctrl+C
cleanup() {
    echo ""
    echo "🛑 Arrêt des services..."
    kill $API_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Démarrer l'API
echo "📡 Démarrage de l'API..."
cd /Users/kouameulrich/Projets/api-datafriday
npm run start:dev > /tmp/api.log 2>&1 &
API_PID=$!

sleep 5

# Vérifier que l'API a démarré
if ! curl -s http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    echo "❌ L'API n'a pas pu démarrer. Voir /tmp/api.log"
    tail -20 /tmp/api.log
    kill $API_PID 2>/dev/null
    exit 1
fi

echo "✅ API démarrée sur http://localhost:3000"

# Démarrer le Frontend
echo "🎨 Démarrage du Frontend..."
cd /Users/kouameulrich/Projets/api-datafriday/frontend
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

echo "✅ Frontend démarré sur http://localhost:5173"
echo ""
echo "═══════════════════════════════════════════"
echo "  📚 Documentation: http://localhost:3000/docs"
echo "  🎫 Weezevent: http://localhost:5173/weezevent"
echo "═══════════════════════════════════════════"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter les services"
echo ""

# Garder le script actif et afficher les logs
tail -f /tmp/api.log /tmp/frontend.log
