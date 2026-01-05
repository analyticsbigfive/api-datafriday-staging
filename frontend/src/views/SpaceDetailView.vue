<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      <p class="text-white mt-4">Chargement...</p>
    </div>

    <!-- Error -->
    <div v-else-if="!space" class="text-center py-12">
      <span class="text-6xl">❌</span>
      <p class="text-white mt-4 text-lg">Espace non trouvé</p>
      <router-link to="/spaces" class="btn btn-primary mt-4">
        ← Retour à la liste
      </router-link>
    </div>

    <!-- Space Details -->
    <div v-else>
      <!-- Header -->
      <div class="mb-8 flex justify-between items-start">
        <div>
          <router-link to="/spaces" class="text-white/70 hover:text-white mb-2 inline-block">
            ← Retour à la liste
          </router-link>
          <h1 class="text-3xl font-bold text-white">{{ space.name }}</h1>
          <p class="text-white/70 mt-1">ID: {{ space.id }}</p>
        </div>
        <button
          @click="togglePin"
          class="text-4xl hover:scale-110 transition-transform"
        >
          {{ isPinned ? '⭐' : '☆' }}
        </button>
      </div>

      <!-- Image -->
      <div v-if="space.image" class="card mb-6">
        <img
          :src="space.image"
          :alt="space.name"
          class="w-full h-64 object-cover rounded-lg"
        />
      </div>

      <!-- Info Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="card">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 font-medium">Configurations</p>
              <p class="text-2xl font-bold text-gray-900">{{ space.configs?.length || 0 }}</p>
            </div>
            <span class="text-3xl">⚙️</span>
          </div>
        </div>

        <div class="card">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 font-medium">Utilisateurs</p>
              <p class="text-2xl font-bold text-gray-900">{{ space._count?.userAccess || 0 }}</p>
            </div>
            <span class="text-3xl">👥</span>
          </div>
        </div>

        <div class="card">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 font-medium">Favoris</p>
              <p class="text-2xl font-bold text-gray-900">{{ space._count?.pinnedByUsers || 0 }}</p>
            </div>
            <span class="text-3xl">⭐</span>
          </div>
        </div>
      </div>

      <!-- Details -->
      <div class="card mb-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">📋 Informations</h2>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-600">Organisation</span>
            <span class="font-medium text-gray-900">{{ space.tenant?.name }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Créé le</span>
            <span class="font-medium text-gray-900">{{ formatDate(space.createdAt) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Dernière mise à jour</span>
            <span class="font-medium text-gray-900">{{ formatDate(space.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Configurations -->
      <div v-if="space.configs && space.configs.length > 0" class="card mb-6">
        <h2 class="text-xl font-bold text-gray-900 mb-4">⚙️ Configurations</h2>
        <div class="space-y-3">
          <div
            v-for="config in space.configs"
            :key="config.id"
            class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-semibold text-gray-900">{{ config.name }}</h3>
                <p class="text-sm text-gray-500 mt-1">
                  Capacité: {{ config.capacity || 'Non définie' }}
                </p>
                <p class="text-xs text-gray-400 mt-1">
                  Créée le {{ formatDate(config.createdAt) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Access Management (ADMIN/MANAGER only) -->
      <div v-if="canManageAccess" class="card mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold text-gray-900">👥 Gestion des accès</h2>
          <button
            @click="showAccessModal = true"
            class="btn btn-primary text-sm"
          >
            ➕ Ajouter un utilisateur
          </button>
        </div>

        <div v-if="loadingUsers" class="text-center py-4">
          <p class="text-gray-500">Chargement...</p>
        </div>

        <div v-else-if="spaceUsers.length === 0" class="text-center py-8">
          <p class="text-gray-500">Aucun utilisateur avec accès spécifique</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="access in spaceUsers"
            :key="access.id"
            class="border border-gray-200 rounded-lg p-4 flex justify-between items-center"
          >
            <div>
              <p class="font-semibold text-gray-900">
                {{ access.user.firstName }} {{ access.user.lastName }}
              </p>
              <p class="text-sm text-gray-500">{{ access.user.email }}</p>
              <span
                class="inline-block mt-2 px-2 py-1 text-xs rounded"
                :class="{
                  'bg-red-100 text-red-800': access.role === 'ADMIN',
                  'bg-blue-100 text-blue-800': access.role === 'MANAGER',
                  'bg-green-100 text-green-800': access.role === 'STAFF',
                  'bg-gray-100 text-gray-800': access.role === 'VIEWER'
                }"
              >
                {{ access.role }}
              </span>
            </div>
            <button
              @click="revokeUserAccess(access.userId)"
              class="btn btn-danger text-sm"
            >
              Révoquer
            </button>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="card">
        <h2 class="text-xl font-bold text-gray-900 mb-4">🎯 Actions</h2>
        <div class="flex flex-wrap gap-3">
          <button
            v-if="canEdit"
            @click="editSpace"
            class="btn btn-primary"
          >
            ✏️ Modifier
          </button>
          <button
            v-if="canDelete"
            @click="confirmDelete"
            class="btn btn-danger"
          >
            🗑️ Supprimer
          </button>
          <router-link to="/spaces" class="btn btn-secondary">
            ← Retour
          </router-link>
        </div>
      </div>
    </div>

    <!-- Access Modal -->
    <div
      v-if="showAccessModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click.self="showAccessModal = false"
    >
      <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Accorder un accès</h2>
        <form @submit.prevent="grantAccess">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              ID Utilisateur *
            </label>
            <input
              v-model="accessForm.userId"
              type="text"
              required
              placeholder="user-123"
              class="input w-full"
            />
            <p class="text-xs text-gray-500 mt-1">
              Copiez l'ID depuis la page des utilisateurs
            </p>
          </div>

          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Rôle *
            </label>
            <select v-model="accessForm.role" required class="input w-full">
              <option value="">Sélectionner...</option>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="STAFF">STAFF</option>
              <option value="VIEWER">VIEWER</option>
            </select>
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              @click="showAccessModal = false"
              class="btn btn-secondary flex-1"
            >
              Annuler
            </button>
            <button
              type="submit"
              :disabled="accessLoading"
              class="btn btn-primary flex-1"
            >
              {{ accessLoading ? 'En cours...' : 'Accorder' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Modal -->
    <div
      v-if="showDeleteModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click.self="showDeleteModal = false"
    >
      <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">Confirmer la suppression</h2>
        <p class="text-gray-600 mb-6">
          Êtes-vous sûr de vouloir supprimer l'espace <strong>{{ space?.name }}</strong> ?
          Cette action est irréversible et supprimera toutes les données associées.
        </p>
        <div class="flex gap-3">
          <button
            @click="showDeleteModal = false"
            class="btn btn-secondary flex-1"
          >
            Annuler
          </button>
          <button
            @click="deleteSpace"
            :disabled="deleteLoading"
            class="btn btn-danger flex-1"
          >
            {{ deleteLoading ? 'Suppression...' : 'Supprimer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSpacesStore } from '@/stores/spaces'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const spacesStore = useSpacesStore()
const authStore = useAuthStore()

const space = ref(null)
const spaceUsers = ref([])
const loading = ref(true)
const loadingUsers = ref(false)
const showAccessModal = ref(false)
const showDeleteModal = ref(false)
const accessLoading = ref(false)
const deleteLoading = ref(false)

const accessForm = ref({
  userId: '',
  role: ''
})

// Computed
const userRole = computed(() => authStore.dbUser?.role)
const canEdit = computed(() => ['ADMIN', 'MANAGER'].includes(userRole.value))
const canDelete = computed(() => userRole.value === 'ADMIN')
const canManageAccess = computed(() => ['ADMIN', 'MANAGER'].includes(userRole.value))
const isPinned = computed(() => spacesStore.isPinned(route.params.id))

// Methods
const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const togglePin = async () => {
  if (isPinned.value) {
    await spacesStore.unpinSpace(route.params.id)
  } else {
    await spacesStore.pinSpace(route.params.id)
  }
}

const editSpace = () => {
  router.push(`/spaces/${route.params.id}/edit`)
}

const confirmDelete = () => {
  showDeleteModal.value = true
}

const deleteSpace = async () => {
  deleteLoading.value = true
  try {
    await spacesStore.deleteSpace(route.params.id)
    router.push('/spaces')
  } catch (error) {
    console.error('Delete failed:', error)
  } finally {
    deleteLoading.value = false
  }
}

const loadSpaceUsers = async () => {
  if (!canManageAccess.value) return
  
  loadingUsers.value = true
  try {
    spaceUsers.value = await spacesStore.fetchSpaceUsers(route.params.id)
  } catch (error) {
    console.error('Failed to load users:', error)
  } finally {
    loadingUsers.value = false
  }
}

const grantAccess = async () => {
  accessLoading.value = true
  try {
    await spacesStore.grantAccess(
      route.params.id,
      accessForm.value.userId,
      accessForm.value.role
    )
    showAccessModal.value = false
    accessForm.value = { userId: '', role: '' }
    await loadSpaceUsers()
  } catch (error) {
    console.error('Grant access failed:', error)
  } finally {
    accessLoading.value = false
  }
}

const revokeUserAccess = async (userId) => {
  if (!confirm('Révoquer l\'accès de cet utilisateur ?')) return
  
  try {
    await spacesStore.revokeAccess(route.params.id, userId)
    await loadSpaceUsers()
  } catch (error) {
    console.error('Revoke access failed:', error)
  }
}

// Lifecycle
onMounted(async () => {
  loading.value = true
  try {
    space.value = await spacesStore.fetchSpace(route.params.id)
    await spacesStore.fetchPinned()
    await loadSpaceUsers()
  } catch (error) {
    console.error('Failed to load space:', error)
  } finally {
    loading.value = false
  }
})
</script>
