# 🧪 Guide de Test - Module Spaces

## URLs de test

- **Frontend** : http://localhost:5173
- **API** : http://localhost:3001/api/v1
- **Swagger** : http://localhost:3001/docs

---

## 🎯 Scénarios de test

### 1️⃣ Connexion et accès

1. Allez sur http://localhost:5173
2. Connectez-vous avec votre compte Supabase
3. Si première connexion : complétez l'onboarding
4. Vous arrivez sur le Dashboard

### 2️⃣ Accéder aux Espaces

Depuis le Dashboard, cliquez sur **"🏗️ Mes Espaces"**

Ou allez directement sur : http://localhost:5173/spaces

---

## ✅ Tests à effectuer

### Test 1 : Créer un espace (ADMIN/MANAGER uniquement)

1. Sur la page Espaces, cliquez sur **"➕ Nouvel espace"**
2. Remplissez le formulaire :
   - Nom : `Restaurant Le Gourmet`
   - Image : `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4` (optionnel)
3. Cliquez sur **"Créer"**
4. ✅ Vérifiez que l'espace apparaît dans la liste

### Test 2 : Rechercher un espace

1. Dans la barre de recherche, tapez une partie du nom
2. ✅ Vérifiez que les résultats sont filtrés en temps réel

### Test 3 : Épingler un espace (tous les rôles)

1. Cliquez sur l'étoile ☆ d'un espace
2. ✅ L'étoile devient ⭐ et l'espace apparaît dans la section "Favoris"
3. Cliquez à nouveau sur ⭐
4. ✅ L'espace est retiré des favoris

### Test 4 : Voir les détails d'un espace

1. Cliquez sur un espace ou sur **"👁️ Voir"**
2. ✅ Vérifiez que vous voyez :
   - Nom, ID, image
   - Nombre de configurations
   - Nombre d'utilisateurs avec accès
   - Statistiques (favoris)
   - Informations (organisation, dates)

### Test 5 : Modifier un espace (ADMIN/MANAGER)

1. Sur la page de liste, cliquez sur **"✏️ Modifier"**
2. Changez le nom : `Restaurant Le Gourmet - VIP`
3. Cliquez sur **"Mettre à jour"**
4. ✅ Le nom est modifié dans la liste

### Test 6 : Gérer les accès (ADMIN/MANAGER)

1. Sur la page de détail d'un espace
2. Section **"👥 Gestion des accès"**
3. Cliquez sur **"➕ Ajouter un utilisateur"**
4. Entrez un ID utilisateur valide (voir dans la DB ou créer un autre compte)
5. Sélectionnez un rôle (STAFF, VIEWER, etc.)
6. ✅ L'utilisateur apparaît dans la liste
7. Cliquez sur **"Révoquer"**
8. ✅ L'accès est supprimé

### Test 7 : Voir les statistiques (ADMIN/MANAGER)

Sur la page Espaces, les cartes en haut affichent :
- ✅ Total espaces
- ✅ Total configurations
- ✅ Nombre de favoris

### Test 8 : Pagination

1. Si vous avez plus de 10 espaces, testez les boutons de pagination
2. ✅ Naviguez entre les pages

### Test 9 : Supprimer un espace (ADMIN uniquement)

1. Sur un espace, cliquez sur **"🗑️"**
2. Confirmez la suppression
3. ✅ L'espace disparaît de la liste

---

## 🔒 Tests des permissions

### Avec un compte ADMIN

- ✅ Peut créer, modifier, supprimer
- ✅ Peut gérer les accès
- ✅ Voit les statistiques

### Avec un compte MANAGER

- ✅ Peut créer et modifier
- ❌ Ne peut PAS supprimer
- ✅ Peut gérer les accès
- ✅ Voit les statistiques

### Avec un compte STAFF

- ❌ Ne peut PAS créer/modifier/supprimer
- ❌ Ne peut PAS gérer les accès
- ✅ Peut voir la liste et les détails
- ✅ Peut épingler des favoris
- ❌ Ne voit PAS les statistiques

### Avec un compte VIEWER

- ❌ Ne peut PAS créer/modifier/supprimer
- ❌ Ne peut PAS gérer les accès
- ✅ Peut voir la liste et les détails
- ✅ Peut épingler des favoris
- ❌ Ne voit PAS les statistiques

---

## 🧪 Tests API (via Swagger)

1. Allez sur http://localhost:3001/docs
2. Cherchez la section **"Spaces"**
3. Cliquez sur **"Authorize"** et collez votre token JWT
4. Testez les endpoints directement depuis Swagger

### Endpoints à tester :

- `GET /spaces` - Liste
- `POST /spaces` - Créer
- `GET /spaces/{id}` - Détails
- `PATCH /spaces/{id}` - Modifier
- `DELETE /spaces/{id}` - Supprimer
- `POST /spaces/{id}/pin` - Épingler
- `DELETE /spaces/{id}/pin` - Désépingler
- `GET /spaces/pinned` - Favoris
- `POST /spaces/{id}/access` - Accorder accès
- `DELETE /spaces/{id}/access/{userId}` - Révoquer
- `GET /spaces/{id}/users` - Utilisateurs
- `GET /spaces/statistics` - Stats

---

## 🐛 Résolution de problèmes

### Erreur 401 (Unauthorized)

- Vérifiez que vous êtes bien connecté
- Le token JWT a peut-être expiré → reconnectez-vous

### Erreur 403 (Forbidden)

- Votre rôle n'a pas la permission pour cette action
- Exemple : STAFF ne peut pas créer d'espaces

### Erreur 404 (Not Found)

- L'espace n'existe pas ou a été supprimé
- Vérifiez l'ID de l'espace

### Bouton "Nouvel espace" n'apparaît pas

- Normal si vous êtes STAFF ou VIEWER
- Seuls ADMIN et MANAGER peuvent créer

### Les statistiques n'apparaissent pas

- Normal si vous êtes STAFF ou VIEWER
- Seuls ADMIN et MANAGER voient les stats

---

## 📊 Données de test

Pour créer des espaces de test rapidement :

```javascript
// Via la console navigateur (F12)
const spacesStore = useSpacesStore()

// Créer 5 espaces
for (let i = 1; i <= 5; i++) {
  await spacesStore.createSpace({
    name: `Test Space ${i}`,
    image: `https://picsum.photos/seed/${i}/400/300`
  })
}
```

Ou utilisez ces images d'exemple :
- Restaurant : `https://images.unsplash.com/photo-1517248135467-4c7edcad34c4`
- Bar : `https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2`
- Salle : `https://images.unsplash.com/photo-1519167758481-83f29da8c9b1`

---

## ✨ Fonctionnalités implémentées

- ✅ CRUD complet (Create, Read, Update, Delete)
- ✅ Recherche temps réel avec debounce
- ✅ Pagination (10 items par page)
- ✅ Système de favoris (pin/unpin)
- ✅ Gestion des accès utilisateurs
- ✅ Statistiques globales
- ✅ Permissions par rôle
- ✅ Messages toast de confirmation
- ✅ Modals de confirmation pour suppression
- ✅ Design responsive
- ✅ Loading states
- ✅ Empty states

---

## 🎨 Design

- Interface moderne avec Tailwind CSS
- Cards avec hover effects
- Icons emoji pour meilleure UX
- Boutons colorés selon l'action
- Modals animées
- États de chargement avec spinners

---

## 🚀 Prochaines étapes

1. ✅ Module Spaces fonctionnel
2. 🔄 Ajouter la gestion des Configs
3. 🔄 Upload d'images (via service)
4. 🔄 Module Users complet
5. 🔄 Tests E2E automatisés

Bon test ! 🎉
