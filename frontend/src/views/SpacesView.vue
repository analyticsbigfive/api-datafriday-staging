<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8 flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-white">🏢 Mes Espaces</h1>
        <p class="text-white/70 mt-1">Gérez vos établissements</p>
      </div>
      <button
        v-if="canCreate"
        @click="showCreateModal = true"
        class="btn btn-primary"
      >
        ➕ Nouvel espace
      </button>
    </div>

    <!-- Statistics Cards (pour ADMIN/MANAGER) -->
    <div v-if="canViewStats && statistics" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Total espaces</p>
            <p class="text-3xl font-bold text-gray-900">{{ statistics.totalSpaces }}</p>
          </div>
          <span class="text-4xl">🏢</span>
        </div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Configurations</p>
            <p class="text-3xl font-bold text-gray-900">{{ statistics.totalConfigs }}</p>
          </div>
          <span class="text-4xl">⚙️</span>
        </div>
      </div>
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Favoris</p>
            <p class="text-3xl font-bold text-gray-900">{{ pinnedSpaces.length }}</p>
          </div>
          <span class="text-4xl">⭐</span>
        </div>
      </div>
    </div>

    <!-- Search bar -->
    <div class="card mb-6">
      <div class="flex gap-4">
        <input
          v-model="searchQuery"
          @input="debounceSearch"
          type="text"
          placeholder="🔍 Rechercher un espace..."
          class="input flex-1"
        />
        <button v-if="searchQuery" @click="clearSearch" class="btn btn-secondary">
          ✕ Effacer
        </button>
      </div>
    </div>

    <!-- Pinned Spaces -->
    <div v-if="pinnedSpaces.length > 0" class="mb-8">
      <h2 class="text-xl font-bold text-white mb-4">⭐ Favoris</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="space in pinnedSpaces"
          :key="space.id"
          class="card hover:shadow-lg transition-shadow cursor-pointer"
          @click="viewSpace(space.id)"
        >
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900">{{ space.name }}</h3>
              <p class="text-sm text-gray-500 mt-1">
                {{ space._count?.configs || 0 }} configuration(s)
              </p>
            </div>
            <button
              @click.stop="togglePin(space.id)"
              class="text-2xl hover:scale-110 transition-transform"
            >
              ⭐
            </button>
          </div>
          <img
            v-if="space.image"
            :src="space.image"
            :alt="space.name"
            class="w-full h-32 object-cover rounded-lg mb-3"
          />
          <div class="flex gap-2">
            <button
              v-if="canEdit"
              @click.stop="editSpace(space)"
              class="btn btn-secondary text-sm flex-1"
            >
              ✏️ Modifier
            </button>
            <button
              @click.stop="viewSpace(space.id)"
              class="btn btn-primary text-sm flex-1"
            >
              👁️ Voir
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- All Spaces -->
    <div class="card">
      <h2 class="text-xl font-bold text-gray-900 mb-4">
        {{ pinnedSpaces.length > 0 ? 'Tous les espaces' : 'Liste des espaces' }}
      </h2>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-8">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <p class="text-gray-500 mt-2">Chargement...</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="spaces.length === 0 && !searchQuery" class="text-center py-12">
        <span class="text-6xl">🏢</span>
        <p class="text-gray-600 mt-4 text-lg">Aucun espace pour le moment</p>
        <button
          v-if="canCreate"
          @click="showCreateModal = true"
          class="btn btn-primary mt-4"
        >
          Créer mon premier espace
        </button>
      </div>

      <!-- No results -->
      <div v-else-if="spaces.length === 0 && searchQuery" class="text-center py-12">
        <span class="text-6xl">🔍</span>
        <p class="text-gray-600 mt-4 text-lg">Aucun résultat pour "{{ searchQuery }}"</p>
      </div>

      <!-- Spaces grid -->
      <div v-else>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="space in spaces"
            :key="space.id"
            class="border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
            @click="viewSpace(space.id)"
          >
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900">{{ space.name }}</h3>
                <p class="text-sm text-gray-500 mt-1">
                  {{ space._count?.configs || 0 }} configuration(s)
                </p>
                <p class="text-xs text-gray-400 mt-1">
                  Créé le {{ formatDate(space.createdAt) }}
                </p>
              </div>
              <button
                @click.stop="togglePin(space.id)"
                class="text-2xl hover:scale-110 transition-transform"
              >
                {{ isPinned(space.id) ? '⭐' : '☆' }}
              </button>
            </div>

            <img
              v-if="space.image"
              :src="space.image"
              :alt="space.name"
              class="w-full h-32 object-cover rounded-lg mb-3"
            />

            <div class="flex gap-2 mt-4">
              <button
                v-if="canEdit"
                @click.stop="editSpace(space)"
                class="btn btn-secondary text-sm flex-1"
              >
                ✏️ Modifier
              </button>
              <button
                v-if="canDelete"
                @click.stop="confirmDelete(space)"
                class="btn btn-danger text-sm"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="pagination.totalPages > 1" class="mt-8 flex justify-center items-center gap-4">
          <button
            @click="goToPage(pagination.page - 1)"
            :disabled="pagination.page === 1"
            class="btn btn-secondary"
            :class="{ 'opacity-50 cursor-not-allowed': pagination.page === 1 }"
          >
            ← Précédent
          </button>
          <span class="text-white">
            Page {{ pagination.page }} / {{ pagination.totalPages }}
          </span>
          <button
            @click="goToPage(pagination.page + 1)"
            :disabled="pagination.page === pagination.totalPages"
            class="btn btn-secondary"
            :class="{ 'opacity-50 cursor-not-allowed': pagination.page === pagination.totalPages }"
          >
            Suivant →
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div
      v-if="showCreateModal || showEditModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click.self="closeModals"
    >
      <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">
          {{ showEditModal ? 'Modifier l\'espace' : 'Nouvel espace' }}
        </h2>

        <form @submit.prevent="submitForm">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Nom de l'espace *
            </label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="Restaurant Le Gourmet"
              class="input w-full"
            />
          </div>

          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Image (URL)
            </label>
            <input
              v-model="form.image"
              type="url"
              placeholder="https://example.com/image.jpg"
              class="input w-full"
            />
            <p class="text-xs text-gray-500 mt-1">Optionnel</p>
          </div>

          <div v-if="formError" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p class="text-red-700 text-sm">{{ formError }}</p>
          </div>

          <div class="flex gap-3">
            <button
              type="button"
              @click="closeModals"
              class="btn btn-secondary flex-1"
            >
              Annuler
            </button>
            <button
              type="submit"
              :disabled="formLoading"
              class="btn btn-primary flex-1"
            >
              {{ formLoading ? 'En cours...' : (showEditModal ? 'Mettre à jour' : 'Créer') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div
      v-if="showDeleteModal"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      @click.self="showDeleteModal = false"
    >
      <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">Confirmer la suppression</h2>
        <p class="text-gray-600 mb-6">
          Êtes-vous sûr de vouloir supprimer l'espace <strong>{{ spaceToDelete?.name }}</strong> ?
          Cette action est irréversible.
        </p>
        <div class="flex gap-3">
          <button
            @click="showDeleteModal = false"
            class="btn btn-secondary flex-1"
          >
            Annuler
          </button>
          <button
            @click="deleteConfirmed"
            :disabled="formLoading"
            class="btn btn-danger flex-1"
          >
            {{ formLoading ? 'Suppression...' : 'Supprimer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSpacesStore } from '@/stores/spaces'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const spacesStore = useSpacesStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showDeleteModal = ref(false)
const spaceToDelete = ref(null)
const editingSpace = ref(null)
const formLoading = ref(false)
const formError = ref('')
let debounceTimer = null

const form = ref({
  name: '',
  image: ''
})

// Computed
const spaces = computed(() => spacesStore.spaces)
const pinnedSpaces = computed(() => spacesStore.pinnedSpaces)
const loading = computed(() => spacesStore.loading)
const pagination = computed(() => spacesStore.pagination)
const statistics = computed(() => spacesStore.statistics)
const userRole = computed(() => authStore.dbUser?.role)

const canCreate = computed(() => ['ADMIN', 'MANAGER'].includes(userRole.value))
const canEdit = computed(() => ['ADMIN', 'MANAGER'].includes(userRole.value))
const canDelete = computed(() => userRole.value === 'ADMIN')
const canViewStats = computed(() => ['ADMIN', 'MANAGER'].includes(userRole.value))

const isPinned = (spaceId) => {
  return spacesStore.isPinned(spaceId)
}

// Methods
const debounceSearch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    spacesStore.fetchSpaces(searchQuery.value, 1)
  }, 300)
}

const clearSearch = () => {
  searchQuery.value = ''
  spacesStore.fetchSpaces('', 1)
}

const goToPage = (page) => {
  spacesStore.fetchSpaces(searchQuery.value, page)
}

const togglePin = async (spaceId) => {
  if (isPinned(spaceId)) {
    await spacesStore.unpinSpace(spaceId)
  } else {
    await spacesStore.pinSpace(spaceId)
  }
}

const viewSpace = (spaceId) => {
  router.push(`/spaces/${spaceId}`)
}

const editSpace = (space) => {
  editingSpace.value = space
  form.value = {
    name: space.name,
    image: space.image || ''
  }
  showEditModal.value = true
}

const confirmDelete = (space) => {
  spaceToDelete.value = space
  showDeleteModal.value = true
}

const deleteConfirmed = async () => {
  formLoading.value = true
  try {
    await spacesStore.deleteSpace(spaceToDelete.value.id)
    showDeleteModal.value = false
    spaceToDelete.value = null
  } catch (error) {
    console.error('Delete failed:', error)
  } finally {
    formLoading.value = false
  }
}

const submitForm = async () => {
  formLoading.value = true
  formError.value = ''

  try {
    const data = {
      name: form.value.name,
      ...(form.value.image && { image: form.value.image })
    }

    if (showEditModal.value) {
      await spacesStore.updateSpace(editingSpace.value.id, data)
    } else {
      await spacesStore.createSpace(data)
    }

    closeModals()
  } catch (error) {
    formError.value = error.response?.data?.message || 'Une erreur est survenue'
  } finally {
    formLoading.value = false
  }
}

const closeModals = () => {
  showCreateModal.value = false
  showEditModal.value = false
  editingSpace.value = null
  form.value = { name: '', image: '' }
  formError.value = ''
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('fr-FR')
}

// Lifecycle
onMounted(async () => {
  await spacesStore.fetchSpaces()
  await spacesStore.fetchPinned()
  if (canViewStats.value) {
    await spacesStore.fetchStatistics()
  }
})
</script>
