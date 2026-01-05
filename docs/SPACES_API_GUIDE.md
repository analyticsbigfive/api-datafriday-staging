# 🏢 API Spaces - Guide Complet

## Vue d'ensemble

Le module **Spaces** permet de gérer les espaces/établissements d'une organisation (restaurants, bars, salles, etc.).

**Base URL** : `http://localhost:3001/api/v1/spaces`

---

## 🔐 Authentification

Tous les endpoints nécessitent un token JWT Supabase dans le header :

```http
Authorization: Bearer <votre_token_jwt>
```

---

## 📋 Endpoints disponibles

### 1. **Créer un espace** `POST /spaces`

**Rôles requis** : `ADMIN`, `MANAGER`

**Body** :
```json
{
  "name": "Restaurant Le Gourmet",
  "image": "https://example.com/restaurant.jpg"
}
```

**Réponse** (201 Created) :
```json
{
  "id": "space-abc123xyz",
  "name": "Restaurant Le Gourmet",
  "image": "https://example.com/restaurant.jpg",
  "tenantId": "tenant-123",
  "createdAt": "2025-12-26T16:00:00.000Z",
  "updatedAt": "2025-12-26T16:00:00.000Z",
  "tenant": {
    "id": "tenant-123",
    "name": "Mon Organisation",
    "slug": "mon-organisation"
  }
}
```

---

### 2. **Lister les espaces** `GET /spaces`

**Rôles requis** : Tous (ADMIN, MANAGER, STAFF, VIEWER)

**Query Params** :
- `search` (optionnel) - Recherche par nom
- `page` (optionnel, défaut: 1) - Numéro de page
- `limit` (optionnel, défaut: 10) - Éléments par page (max: 100)

**Exemple** :
```http
GET /spaces?search=restaurant&page=1&limit=10
```

**Réponse** (200 OK) :
```json
{
  "data": [
    {
      "id": "space-abc123",
      "name": "Restaurant Le Gourmet",
      "image": "https://example.com/restaurant.jpg",
      "tenantId": "tenant-123",
      "createdAt": "2025-12-26T16:00:00.000Z",
      "updatedAt": "2025-12-26T16:00:00.000Z",
      "_count": {
        "configs": 2,
        "pinnedByUsers": 3
      }
    }
  ],
  "meta": {
    "total": 15,
    "page": 1,
    "limit": 10,
    "totalPages": 2
  }
}
```

---

### 3. **Obtenir un espace** `GET /spaces/:id`

**Rôles requis** : Tous

**Réponse** (200 OK) :
```json
{
  "id": "space-abc123",
  "name": "Restaurant Le Gourmet",
  "image": "https://example.com/restaurant.jpg",
  "tenantId": "tenant-123",
  "createdAt": "2025-12-26T16:00:00.000Z",
  "updatedAt": "2025-12-26T16:00:00.000Z",
  "tenant": {
    "id": "tenant-123",
    "name": "Mon Organisation",
    "slug": "mon-organisation"
  },
  "configs": [
    {
      "id": "config-1",
      "name": "Configuration Principale",
      "capacity": 150,
      "createdAt": "2025-12-26T16:00:00.000Z"
    }
  ],
  "_count": {
    "pinnedByUsers": 3,
    "userAccess": 5
  }
}
```

**Erreurs** :
- `404` - Espace non trouvé

---

### 4. **Mettre à jour un espace** `PATCH /spaces/:id`

**Rôles requis** : `ADMIN`, `MANAGER`

**Body** (tous les champs optionnels) :
```json
{
  "name": "Nouveau nom",
  "image": "https://example.com/new-image.jpg"
}
```

**Réponse** (200 OK) :
```json
{
  "id": "space-abc123",
  "name": "Nouveau nom",
  "image": "https://example.com/new-image.jpg",
  "tenantId": "tenant-123",
  "createdAt": "2025-12-26T16:00:00.000Z",
  "updatedAt": "2025-12-26T17:00:00.000Z",
  "tenant": {
    "id": "tenant-123",
    "name": "Mon Organisation",
    "slug": "mon-organisation"
  }
}
```

---

### 5. **Supprimer un espace** `DELETE /spaces/:id`

**Rôles requis** : `ADMIN` uniquement

**Réponse** (200 OK) :
```json
{
  "message": "Space deleted successfully"
}
```

⚠️ **Attention** : Suppression définitive (hard delete). Toutes les données associées seront supprimées.

---

## ⭐ Gestion des favoris (Épinglage)

### 6. **Épingler un espace** `POST /spaces/:id/pin`

**Rôles requis** : Tous

Ajoute l'espace aux favoris de l'utilisateur.

**Réponse** (200 OK) :
```json
{
  "message": "Space pinned successfully",
  "pinned": {
    "id": "pin-123",
    "userId": "user-456",
    "spaceId": "space-abc123",
    "pinnedAt": "2025-12-26T16:00:00.000Z",
    "space": {
      "id": "space-abc123",
      "name": "Restaurant Le Gourmet",
      "image": "https://example.com/restaurant.jpg"
    }
  }
}
```

---

### 7. **Désépingler un espace** `DELETE /spaces/:id/pin`

**Rôles requis** : Tous

**Réponse** (200 OK) :
```json
{
  "message": "Space unpinned successfully"
}
```

---

### 8. **Lister les espaces épinglés** `GET /spaces/pinned`

**Rôles requis** : Tous

**Réponse** (200 OK) :
```json
[
  {
    "id": "space-abc123",
    "name": "Restaurant Le Gourmet",
    "image": "https://example.com/restaurant.jpg",
    "tenantId": "tenant-123",
    "createdAt": "2025-12-26T16:00:00.000Z",
    "updatedAt": "2025-12-26T16:00:00.000Z",
    "_count": {
      "configs": 2
    }
  }
]
```

---

## 👥 Gestion des accès utilisateurs

### 9. **Donner accès à un utilisateur** `POST /spaces/:id/access`

**Rôles requis** : `ADMIN`, `MANAGER`

**Body** :
```json
{
  "userId": "user-123",
  "role": "STAFF"
}
```

**Rôles disponibles** : `ADMIN`, `MANAGER`, `STAFF`, `VIEWER`

**Réponse** (200 OK) :
```json
{
  "id": "access-123",
  "userId": "user-123",
  "spaceId": "space-abc123",
  "role": "STAFF",
  "grantedAt": "2025-12-26T16:00:00.000Z",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "Jean",
    "lastName": "Dupont"
  },
  "space": {
    "id": "space-abc123",
    "name": "Restaurant Le Gourmet"
  }
}
```

---

### 10. **Révoquer l'accès d'un utilisateur** `DELETE /spaces/:id/access/:userId`

**Rôles requis** : `ADMIN`, `MANAGER`

**Réponse** (200 OK) :
```json
{
  "message": "Access revoked successfully"
}
```

---

### 11. **Lister les utilisateurs ayant accès** `GET /spaces/:id/users`

**Rôles requis** : `ADMIN`, `MANAGER`

**Réponse** (200 OK) :
```json
[
  {
    "id": "access-123",
    "userId": "user-123",
    "spaceId": "space-abc123",
    "role": "STAFF",
    "grantedAt": "2025-12-26T16:00:00.000Z",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "firstName": "Jean",
      "lastName": "Dupont",
      "role": "STAFF"
    }
  }
]
```

---

## 📊 Statistiques

### 12. **Obtenir les statistiques** `GET /spaces/statistics`

**Rôles requis** : `ADMIN`, `MANAGER`

**Réponse** (200 OK) :
```json
{
  "totalSpaces": 5,
  "totalConfigs": 12,
  "recentSpaces": [
    {
      "id": "space-abc123",
      "name": "Restaurant Le Gourmet",
      "image": "https://example.com/restaurant.jpg",
      "createdAt": "2025-12-26T16:00:00.000Z"
    }
  ]
}
```

---

## 🚨 Codes d'erreur

| Code | Description |
|------|-------------|
| `200` | Succès |
| `201` | Créé avec succès |
| `400` | Données invalides |
| `401` | Non authentifié (token manquant/invalide) |
| `403` | Accès refusé (rôle insuffisant) |
| `404` | Ressource non trouvée |
| `409` | Conflit (ex: espace déjà existant) |
| `500` | Erreur serveur |

---

## 💡 Exemples d'utilisation (Frontend Vue.js)

### Store Pinia pour Spaces

```javascript
// stores/spaces.js
import { defineStore } from 'pinia'
import api from '@/lib/api'

export const useSpacesStore = defineStore('spaces', {
  state: () => ({
    spaces: [],
    currentSpace: null,
    pinnedSpaces: [],
    loading: false,
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    }
  }),

  actions: {
    async fetchSpaces(search = '', page = 1) {
      this.loading = true
      try {
        const params = new URLSearchParams({ page, limit: 10 })
        if (search) params.append('search', search)
        
        const response = await api.get(`/spaces?${params}`)
        this.spaces = response.data.data
        this.pagination = response.data.meta
      } catch (error) {
        console.error('Error fetching spaces:', error)
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchSpace(id) {
      this.loading = true
      try {
        const response = await api.get(`/spaces/${id}`)
        this.currentSpace = response.data
        return response.data
      } finally {
        this.loading = false
      }
    },

    async createSpace(data) {
      const response = await api.post('/spaces', data)
      this.spaces.unshift(response.data)
      return response.data
    },

    async updateSpace(id, data) {
      const response = await api.patch(`/spaces/${id}`, data)
      const index = this.spaces.findIndex(s => s.id === id)
      if (index !== -1) {
        this.spaces[index] = response.data
      }
      return response.data
    },

    async deleteSpace(id) {
      await api.delete(`/spaces/${id}`)
      this.spaces = this.spaces.filter(s => s.id !== id)
    },

    async pinSpace(id) {
      const response = await api.post(`/spaces/${id}/pin`)
      await this.fetchPinned()
      return response.data
    },

    async unpinSpace(id) {
      await api.delete(`/spaces/${id}/pin`)
      await this.fetchPinned()
    },

    async fetchPinned() {
      const response = await api.get('/spaces/pinned')
      this.pinnedSpaces = response.data
    },

    async grantAccess(spaceId, userId, role) {
      return await api.post(`/spaces/${spaceId}/access`, { userId, role })
    },

    async revokeAccess(spaceId, userId) {
      return await api.delete(`/spaces/${spaceId}/access/${userId}`)
    },

    async fetchSpaceUsers(spaceId) {
      const response = await api.get(`/spaces/${spaceId}/users`)
      return response.data
    },

    async fetchStatistics() {
      const response = await api.get('/spaces/statistics')
      return response.data
    }
  }
})
```

### Composant Vue pour lister les espaces

```vue
<template>
  <div class="spaces-list">
    <h1>Mes Espaces</h1>
    
    <!-- Search bar -->
    <input 
      v-model="searchQuery" 
      @input="debounceSearch"
      placeholder="Rechercher un espace..."
      class="search-input"
    />

    <!-- Loading -->
    <div v-if="loading" class="loading">Chargement...</div>

    <!-- Spaces grid -->
    <div v-else class="spaces-grid">
      <div 
        v-for="space in spaces" 
        :key="space.id" 
        class="space-card"
      >
        <img :src="space.image || '/default-space.jpg'" :alt="space.name" />
        <h3>{{ space.name }}</h3>
        <p>{{ space._count.configs }} configurations</p>
        
        <div class="actions">
          <button @click="pinSpace(space.id)">
            {{ isPinned(space.id) ? '⭐ Épinglé' : '☆ Épingler' }}
          </button>
          <router-link :to="`/spaces/${space.id}`">
            Voir détails
          </router-link>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div class="pagination">
      <button 
        @click="goToPage(pagination.page - 1)" 
        :disabled="pagination.page === 1"
      >
        Précédent
      </button>
      <span>Page {{ pagination.page }} / {{ pagination.totalPages }}</span>
      <button 
        @click="goToPage(pagination.page + 1)" 
        :disabled="pagination.page === pagination.totalPages"
      >
        Suivant
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSpacesStore } from '@/stores/spaces'

const spacesStore = useSpacesStore()
const searchQuery = ref('')
let debounceTimer = null

const spaces = computed(() => spacesStore.spaces)
const pinnedSpaces = computed(() => spacesStore.pinnedSpaces)
const loading = computed(() => spacesStore.loading)
const pagination = computed(() => spacesStore.pagination)

const isPinned = (spaceId) => {
  return pinnedSpaces.value.some(s => s.id === spaceId)
}

const debounceSearch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    spacesStore.fetchSpaces(searchQuery.value)
  }, 300)
}

const goToPage = (page) => {
  spacesStore.fetchSpaces(searchQuery.value, page)
}

const pinSpace = async (spaceId) => {
  if (isPinned(spaceId)) {
    await spacesStore.unpinSpace(spaceId)
  } else {
    await spacesStore.pinSpace(spaceId)
  }
}

onMounted(() => {
  spacesStore.fetchSpaces()
  spacesStore.fetchPinned()
})
</script>
```

---

## 📚 Documentation Swagger

La documentation interactive complète est disponible sur :

**URL** : http://localhost:3001/docs

Cherchez la section **"Spaces"** dans la sidebar pour voir tous les endpoints avec :
- Schémas de requêtes/réponses
- Essayer directement dans le navigateur
- Exemples de code

---

## 🎯 Cas d'usage typiques

### 1. Créer un nouvel établissement
```javascript
const newSpace = await spacesStore.createSpace({
  name: 'Bar Le Central',
  image: 'https://example.com/bar.jpg'
})
```

### 2. Rechercher des espaces
```javascript
await spacesStore.fetchSpaces('restaurant', 1)
```

### 3. Épingler ses favoris
```javascript
await spacesStore.pinSpace('space-abc123')
```

### 4. Gérer les accès
```javascript
// Donner accès STAFF à un utilisateur
await spacesStore.grantAccess('space-abc123', 'user-456', 'STAFF')

// Voir qui a accès
const users = await spacesStore.fetchSpaceUsers('space-abc123')

// Révoquer l'accès
await spacesStore.revokeAccess('space-abc123', 'user-456')
```

---

## 🔒 Permissions par rôle

| Action | ADMIN | MANAGER | STAFF | VIEWER |
|--------|-------|---------|-------|--------|
| Lister les espaces | ✅ | ✅ | ✅ | ✅ |
| Voir un espace | ✅ | ✅ | ✅ | ✅ |
| Créer un espace | ✅ | ✅ | ❌ | ❌ |
| Modifier un espace | ✅ | ✅ | ❌ | ❌ |
| Supprimer un espace | ✅ | ❌ | ❌ | ❌ |
| Épingler/Désépingler | ✅ | ✅ | ✅ | ✅ |
| Gérer les accès | ✅ | ✅ | ❌ | ❌ |
| Voir les statistiques | ✅ | ✅ | ❌ | ❌ |

---

## 🐛 Gestion des erreurs

```javascript
try {
  await spacesStore.createSpace(data)
} catch (error) {
  if (error.response) {
    switch (error.response.status) {
      case 400:
        console.error('Données invalides:', error.response.data.message)
        break
      case 403:
        console.error('Vous n\'avez pas la permission')
        break
      case 409:
        console.error('Cet espace existe déjà')
        break
      default:
        console.error('Erreur:', error.response.data.message)
    }
  }
}
```
