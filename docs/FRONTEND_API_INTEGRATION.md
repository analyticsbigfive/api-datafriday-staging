# 📱 Guide d'Intégration Frontend - API DataFriday
> Documentation pour l'équipe frontend Vue.js

**Base URL:** `https://datafriday-api.onrender.com/api/v1`

---

## 📋 Table des Matières

1. [Authentification avec Supabase](#1-authentification-avec-supabase)
2. [Onboarding - Première Connexion](#2-onboarding---première-connexion)
3. [Accès aux Données](#3-accès-aux-données)
4. [Gestion des Erreurs](#4-gestion-des-erreurs)
5. [Exemples de Code Vue.js](#5-exemples-de-code-vuejs)

---

## 1. Authentification avec Supabase

### 🔑 Prérequis Frontend

L'authentification se fait **entièrement via Supabase** côté frontend. L'API backend valide simplement le token JWT.

**Étapes :**

1. **Créer un compte Supabase** (Sign Up)
2. **Se connecter** (Sign In)
3. **Récupérer le JWT token**
4. **Envoyer le token dans chaque requête API**

### Configuration Supabase (Vue.js)

```javascript
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://alsgdtewqeldrrquypdy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsc2dkdGV3cWVsZHJycXV5cGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMjMyMTQsImV4cCI6MjA3ODU5OTIxNH0.MB_NcLncWd3mSxUwlgf3piU29XAbgFEahgWtyAFqF-A'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### Store Vuex - Authentification

```javascript
// src/store/modules/auth.js
import { supabase } from '@/lib/supabase'
import api from '@/lib/api'

const state = {
  user: null,        // Utilisateur Supabase
  session: null,     // Session Supabase
  dbUser: null,      // Utilisateur dans la base DataFriday
  tenant: null,      // Organisation de l'utilisateur
}

const getters = {
  isAuthenticated: (state) => !!state.session,
  token: (state) => state.session?.access_token,
  hasOrganization: (state) => !!state.tenant,
}

const mutations = {
  SET_USER(state, user) {
    state.user = user
  },
  SET_SESSION(state, session) {
    state.session = session
  },
  SET_DB_USER(state, dbUser) {
    state.dbUser = dbUser
  },
  SET_TENANT(state, tenant) {
    state.tenant = tenant
  },
  CLEAR_AUTH(state) {
    state.user = null
    state.session = null
    state.dbUser = null
    state.tenant = null
  },
}

const actions = {
  // 1. Inscription avec Supabase
  async signUp({ commit }, { email, password }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    
    if (error) throw error
    return data
  },

  // 2. Connexion avec Supabase
  async signIn({ commit, dispatch }, { email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) throw error
    
    commit('SET_SESSION', data.session)
    commit('SET_USER', data.user)
    
    // Après connexion Supabase, vérifier le statut dans DataFriday
    await dispatch('checkOnboardingStatus')
    
    return data
  },

  // 3. Déconnexion
  async signOut({ commit }) {
    await supabase.auth.signOut()
    commit('CLEAR_AUTH')
  },

  // 4. Vérifier le statut d'onboarding
  async checkOnboardingStatus({ commit, getters }) {
    try {
      const response = await api.get('/onboarding/status', {
        headers: {
          Authorization: `Bearer ${getters.token}`
        }
      })
      
      commit('SET_DB_USER', response.data.user)
      commit('SET_TENANT', response.data.tenant)
      
      return {
        exists: response.data.exists,
        hasOrganization: response.data.hasOrganization
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error)
      throw error
    }
  },

  // 5. Initialiser la session au chargement de l'app
  async initialize({ commit, dispatch }) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session) {
      commit('SET_SESSION', session)
      commit('SET_USER', session.user)
      await dispatch('checkOnboardingStatus')
    }
    
    // Écouter les changements d'auth
    supabase.auth.onAuthStateChange((_event, session) => {
      commit('SET_SESSION', session)
      commit('SET_USER', session?.user)
    })
  }
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions
}
```

**Configuration du Store Principal :**

```javascript
// src/store/index.js
import { createStore } from 'vuex'
import auth from './modules/auth'

export default createStore({
  modules: {
    auth
  }
})
```

### Configuration Axios avec Intercepteurs

```javascript
// src/lib/api.js
import axios from 'axios'
import store from '@/store'

const api = axios.create({
  baseURL: 'https://datafriday-api.onrender.com/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Intercepteur Request - Ajouter le token JWT
api.interceptors.request.use(
  (config) => {
    const token = store.getters['auth/token']
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    return config
  },
  (error) => Promise.reject(error)
)

// Intercepteur Response - Gérer les erreurs d'auth
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expiré ou invalide
      await store.dispatch('auth/signOut')
      window.location.href = '/login'
    }
    
    return Promise.reject(error)
  }
)

export default api
```

---

## 2. Onboarding - Première Connexion

Après connexion Supabase, l'utilisateur doit soit **créer une organisation**, soit **rejoindre une organisation existante**.

### 🔍 Vérifier le Statut de l'Utilisateur

**Endpoint:** `GET /api/v1/onboarding/status`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Réponse:**
```json
{
  "exists": false,
  "hasOrganization": false,
  "user": null,
  "tenant": null
}
```

**Scénarios:**

| `exists` | `hasOrganization` | Action Frontend |
|----------|------------------|-----------------|
| `false`  | `false`         | Rediriger vers création d'organisation |
| `true`   | `false`         | Proposer de rejoindre une organisation |
| `true`   | `true`          | Rediriger vers dashboard |

### ✅ Créer une Organisation

**Endpoint:** `POST /api/v1/onboarding`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "Restaurant Le Gourmet",
  "organizationSlug": "restaurant-le-gourmet"
}
```

**Réponse (201):**
```json
{
  "tenant": {
    "id": "tenant-abc123",
    "name": "Restaurant Le Gourmet",
    "slug": "restaurant-le-gourmet",
    "plan": "FREE",
    "status": "TRIAL",
    "invitationCode": "ABC123DEF"
  },
  "user": {
    "id": "user-xyz789",
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "ADMIN",
    "tenantId": "tenant-abc123"
  }
}
```

**Erreurs:**
- `400` - Données invalides (slug déjà utilisé, champs manquants)
- `401` - Token JWT invalide
- `409` - Utilisateur déjà enregistré dans une organisation

### 🤝 Rejoindre une Organisation (Code d'Invitation)

**Endpoint:** `POST /api/v1/onboarding/join-by-code`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "invitationCode": "ABC123DEF",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

**Réponse (201):**
```json
{
  "message": "Successfully joined organization",
  "tenant": {
    "id": "tenant-abc123",
    "name": "Restaurant Le Gourmet",
    "slug": "restaurant-le-gourmet",
    "plan": "FREE",
    "status": "ACTIVE"
  },
  "user": {
    "id": "user-def456",
    "email": "jane@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "role": "STAFF",
    "tenantId": "tenant-abc123"
  }
}
```

**Erreurs:**
- `400` - Code d'invitation invalide ou expiré
- `401` - Token JWT invalide
- `409` - Utilisateur déjà membre d'une organisation

---

## 3. Accès aux Données

Une fois l'onboarding terminé, toutes les requêtes API incluent automatiquement le **contexte tenant** (organisation).

### 👤 Profil Utilisateur Courant

**Endpoint:** `GET /api/v1/me`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Réponse:**
```json
{
  "id": "user-xyz789",
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "ADMIN",
  "tenantId": "tenant-abc123",
  "tenant": {
    "id": "tenant-abc123",
    "name": "Restaurant Le Gourmet",
    "slug": "restaurant-le-gourmet",
    "plan": "FREE",
    "status": "ACTIVE",
    "invitationCode": "ABC123DEF"
  },
  "createdAt": "2026-01-20T10:00:00Z",
  "updatedAt": "2026-01-20T10:00:00Z"
}
```

### 🏢 Espaces (Établissements)

#### Lister les Espaces

**Endpoint:** `GET /api/v1/spaces`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Query Params (optionnels):**
- `page` - Numéro de page (défaut: 1)
- `limit` - Nombre d'items par page (défaut: 20)
- `search` - Recherche par nom

**Réponse:**
```json
{
  "data": [
    {
      "id": "space-123",
      "name": "Restaurant Principal",
      "image": "https://example.com/image.jpg",
      "tenantId": "tenant-abc123",
      "createdAt": "2026-01-20T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

#### Créer un Espace

**Endpoint:** `POST /api/v1/spaces`

**Rôles requis:** `ADMIN`, `MANAGER`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Restaurant Annexe",
  "image": "https://example.com/annexe.jpg"
}
```

**Réponse (201):**
```json
{
  "id": "space-456",
  "name": "Restaurant Annexe",
  "image": "https://example.com/annexe.jpg",
  "tenantId": "tenant-abc123",
  "createdAt": "2026-01-21T14:30:00Z"
}
```

### 👥 Utilisateurs

#### Lister les Utilisateurs

**Endpoint:** `GET /api/v1/users`

**Rôles requis:** `ADMIN`, `MANAGER`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Query Params:**
- `page`, `limit` - Pagination
- `search` - Recherche par nom/email
- `role` - Filtrer par rôle (`ADMIN`, `MANAGER`, `STAFF`, `VIEWER`)

**Réponse:**
```json
{
  "data": [
    {
      "id": "user-xyz789",
      "email": "john@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "ADMIN",
      "isActive": true,
      "lastLoginAt": "2026-01-21T09:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "totalPages": 1
  }
}
```

#### Inviter un Utilisateur

**Endpoint:** `POST /api/v1/users/invite`

**Rôles requis:** `ADMIN`, `MANAGER`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "email": "newuser@example.com",
  "role": "STAFF",
  "firstName": "New",
  "lastName": "User"
}
```

**Réponse (201):**
```json
{
  "user": {
    "id": "user-new123",
    "email": "newuser@example.com",
    "firstName": "New",
    "lastName": "User",
    "role": "STAFF"
  },
  "invitationSent": true
}
```

### 🏢 Informations Organisation

**Endpoint:** `GET /api/v1/tenants/:id`

**Rôles requis:** `ADMIN`, `MANAGER`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Réponse:**
```json
{
  "id": "tenant-abc123",
  "name": "Restaurant Le Gourmet",
  "slug": "restaurant-le-gourmet",
  "plan": "FREE",
  "status": "ACTIVE",
  "invitationCode": "ABC123DEF",
  "createdAt": "2026-01-20T10:00:00Z",
  "updatedAt": "2026-01-21T14:00:00Z",
  "_count": {
    "users": 12,
    "spaces": 3
  }
}
```

---

## 4. Gestion des Erreurs

### Codes d'Erreur HTTP

| Code | Signification | Action Frontend |
|------|--------------|-----------------|
| `200` | OK | Succès |
| `201` | Created | Ressource créée |
| `400` | Bad Request | Afficher les erreurs de validation |
| `401` | Unauthorized | Rediriger vers login |
| `403` | Forbidden | "Accès refusé" + vérifier les rôles |
| `404` | Not Found | "Ressource introuvable" |
| `409` | Conflict | Ressource déjà existante |
| `500` | Server Error | "Erreur serveur, réessayez" |

### Format des Erreurs

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email déjà utilisé"
    }
  ]
}
```

### Gestion dans Vue.js

```javascript
try {
  const response = await api.post('/onboarding', formData)
  // Succès
} catch (error) {
  if (error.response) {
    const { status, data } = error.response
    
    switch (status) {
      case 400:
        // Erreurs de validation
        showErrors(data.errors)
        break
      case 401:
        // Token invalide
        await authStore.signOut()
        router.push('/login')
        break
      case 403:
        // Accès refusé
        toast.error('Vous n\'avez pas les permissions nécessaires')
        break
      case 409:
        // Conflit (ex: slug déjà utilisé)
        toast.error(data.message)
        break
      default:
        toast.error('Une erreur est survenue')
    }
  }
}
```

---

## 5. Exemples de Code Vue.js

### Composant Login

```vue
<template>
  <div class="login-page">
    <form @submit.prevent="handleLogin">
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Mot de passe" required />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Connexion...' : 'Se connecter' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'

export default {
  name: 'LoginView',
  data() {
    return {
      email: '',
      password: '',
      loading: false,
      error: ''
    }
  },
  computed: {
    ...mapGetters('auth', ['hasOrganization'])
  },
  methods: {
    ...mapActions('auth', ['signIn']),
    
    async handleLogin() {
      this.loading = true
      this.error = ''

      try {
        await this.signIn({
          email: this.email,
          password: this.password
        })
        
        // Vérifier si l'utilisateur a une organisation
        if (this.hasOrganization) {
          this.$router.push('/dashboard')
        } else {
          this.$router.push('/onboarding')
        }
      } catch (err) {
        this.error = err.message || 'Erreur de connexion'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>
```

### Composant Onboarding

```vue
<template>
  <div class="onboarding-page">
    <h1>Bienvenue !</h1>
    <p>Choisissez une option pour continuer :</p>

    <!-- Créer une organisation -->
    <div class="option">
      <h2>Créer une organisation</h2>
      <form @submit.prevent="createOrganization">
        <input v-model="form.firstName" placeholder="Prénom" required />
        <input v-model="form.lastName" placeholder="Nom" required />
        <input v-model="form.organizationName" placeholder="Nom de l'organisation" required />
        <button type="submit" :disabled="loading">Créer</button>
      </form>
    </div>

    <!-- Rejoindre une organisation -->
    <div class="option">
      <h2>Rejoindre une organisation</h2>
      <form @submit.prevent="joinOrganization">
        <input v-model="joinForm.invitationCode" placeholder="Code d'invitation" required />
        <input v-model="joinForm.firstName" placeholder="Prénom" required />
        <input v-model="joinForm.lastName" placeholder="Nom" required />
        <button type="submit" :disabled="loading">Rejoindre</button>
      </form>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script>
import api from '@/lib/api'
import { mapMutations } from 'vuex'

export default {
  name: 'OnboardingView',
  data() {
    return {
      loading: false,
      error: '',
      form: {
        firstName: '',
        lastName: '',
        organizationName: '',
        organizationSlug: ''
      },
      joinForm: {
        invitationCode: '',
        firstName: '',
        lastName: ''
      }
    }
  },
  methods: {
    ...mapMutations('auth', ['SET_DB_USER', 'SET_TENANT']),
    
    async createOrganization() {
      this.loading = true
      this.error = ''

      try {
        const response = await api.post('/onboarding', this.form)
        this.SET_DB_USER(response.data.user)
        this.SET_TENANT(response.data.tenant)
        this.$router.push('/dashboard')
      } catch (err) {
        this.error = err.response?.data?.message || 'Erreur lors de la création'
      } finally {
        this.loading = false
      }
    },
    
    async joinOrganization() {
      this.loading = true
      this.error = ''

      try {
        const response = await api.post('/onboarding/join-by-code', this.joinForm)
        this.SET_DB_USER(response.data.user)
        this.SET_TENANT(response.data.tenant)
        this.$router.push('/dashboard')
      } catch (err) {
        this.error = err.response?.data?.message || 'Code d\'invitation invalide'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>
```

### Composable Vuex pour les Espaces

```javascript
// src/composables/useSpaces.js
import { computed } from 'vue'
import { useStore } from 'vuex'
import api from '@/lib/api'

export function useSpaces() {
  const store = useStore()
  
  const spaces = computed(() => store.state.spaces.list)
  const loading = computed(() => store.state.spaces.loading)
  const error = computed(() => store.state.spaces.error)

  const fetchSpaces = async (params = {}) => {
    store.commit('spaces/SET_LOADING', true)
    store.commit('spaces/SET_ERROR', null)

    try {
      const response = await api.get('/spaces', { params })
      store.commit('spaces/SET_SPACES', response.data.data)
      return response.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Erreur lors du chargement'
      store.commit('spaces/SET_ERROR', errorMsg)
      throw err
    } finally {
      store.commit('spaces/SET_LOADING', false)
    }
  }

  const createSpace = async (data) => {
    store.commit('spaces/SET_LOADING', true)
    store.commit('spaces/SET_ERROR', null)

    try {
      const response = await api.post('/spaces', data)
      store.commit('spaces/ADD_SPACE', response.data)
      return response.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Erreur lors de la création'
      store.commit('spaces/SET_ERROR', errorMsg)
      throw err
    } finally {
      store.commit('spaces/SET_LOADING', false)
    }
  }

  const updateSpace = async (id, data) => {
    store.commit('spaces/SET_LOADING', true)
    store.commit('spaces/SET_ERROR', null)

    try {
      const response = await api.patch(`/spaces/${id}`, data)
      store.commit('spaces/UPDATE_SPACE', response.data)
      return response.data
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Erreur lors de la mise à jour'
      store.commit('spaces/SET_ERROR', errorMsg)
      throw err
    } finally {
      store.commit('spaces/SET_LOADING', false)
    }
  }

  const deleteSpace = async (id) => {
    store.commit('spaces/SET_LOADING', true)
    store.commit('spaces/SET_ERROR', null)

    try {
      await api.delete(`/spaces/${id}`)
      store.commit('spaces/REMOVE_SPACE', id)
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Erreur lors de la suppression'
      store.commit('spaces/SET_ERROR', errorMsg)
      throw err
    } finally {
      store.commit('spaces/SET_LOADING', false)
    }
  }

  return {
    spaces,
    loading,
    error,
    fetchSpaces,
    createSpace,
    updateSpace,
    deleteSpace
  }
}
```

**Module Vuex Spaces :**

```javascript
// src/store/modules/spaces.js
const state = {
  list: [],
  loading: false,
  error: null
}

const mutations = {
  SET_SPACES(state, spaces) {
    state.list = spaces
  },
  ADD_SPACE(state, space) {
    state.list.push(space)
  },
  UPDATE_SPACE(state, updatedSpace) {
    const index = state.list.findIndex(s => s.id === updatedSpace.id)
    if (index !== -1) {
      state.list[index] = updatedSpace
    }
  },
  REMOVE_SPACE(state, id) {
    state.list = state.list.filter(s => s.id !== id)
  },
  SET_LOADING(state, loading) {
    state.loading = loading
  },
  SET_ERROR(state, error) {
    state.error = error
  }
}

export default {
  namespaced: true,
  state,
  mutations
}
```

---

## 📝 Notes Importantes

### Sécurité

1. **Ne jamais stocker le token JWT en localStorage** - Utiliser la session Supabase
2. **Toujours valider les permissions côté frontend** (mais la vraie sécurité est backend)
3. **Expiration du token** : Géré automatiquement par Supabase (refresh token)

### Rôles et Permissions

| Rôle | Permissions |
|------|-------------|
| `ADMIN` | Accès complet (gestion organisation, utilisateurs, espaces) |
| `MANAGER` | Gestion des espaces, utilisateurs (lecture seule org) |
| `STAFF` | Lecture/écriture sur les données quotidiennes |
| `VIEWER` | Lecture seule |

### Multi-Tenant

- Le **tenant (organisation)** est **automatiquement déterminé** par le backend via le JWT
- Pas besoin d'envoyer `tenantId` dans les requêtes
- Toutes les données sont **isolées par tenant**

### URLs Utiles

- **API Production:** https://datafriday-api.onrender.com/api/v1
- **Documentation Swagger:** https://datafriday-api.onrender.com/docs
- **Health Check:** https://datafriday-api.onrender.com/api/v1/health

---

## 🆘 Support

En cas de problème :
1. Vérifier les logs dans la console navigateur
2. Vérifier le token JWT dans les Developer Tools
3. Tester les endpoints avec Postman/Thunder Client
4. Consulter la documentation Swagger

**Contact Backend:** [Votre contact]
