<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold text-white">🏢 Gestion des Tenants</h1>
        <p class="text-white/70 mt-1">Gérez vos organisations multi-tenant</p>
      </div>
      <button @click="showCreateModal = true" class="btn btn-primary">
        ➕ Nouveau Tenant
      </button>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="label">Recherche</label>
          <input 
            v-model="filters.search" 
            type="text" 
            class="input" 
            placeholder="Nom ou slug..."
            @input="debouncedSearch"
          />
        </div>
        <div>
          <label class="label">Plan</label>
          <select v-model="filters.plan" class="input" @change="loadTenants">
            <option value="">Tous</option>
            <option value="FREE">Free</option>
            <option value="STARTER">Starter</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
        </div>
        <div>
          <label class="label">Status</label>
          <select v-model="filters.status" class="input" @change="loadTenants">
            <option value="">Tous</option>
            <option value="ACTIVE">Active</option>
            <option value="TRIAL">Trial</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div class="flex items-end">
          <button @click="resetFilters" class="btn btn-secondary w-full">
            🔄 Réinitialiser
          </button>
        </div>
      </div>
    </div>

    <!-- Tenants List -->
    <div class="card">
      <div v-if="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
        <p class="mt-4 text-gray-500">Chargement...</p>
      </div>

      <div v-else-if="tenants.length === 0" class="text-center py-8">
        <p class="text-gray-500">Aucun tenant trouvé</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-gray-200">
              <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Nom</th>
              <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Slug</th>
              <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Plan</th>
              <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Créé le</th>
              <th class="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tenant in tenants" :key="tenant.id" class="border-b border-gray-100 hover:bg-gray-50">
              <td class="py-3 px-4">
                <div class="flex items-center space-x-3">
                  <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <span class="text-primary-600 font-bold">{{ tenant.name.charAt(0) }}</span>
                  </div>
                  <div>
                    <p class="font-medium text-gray-900">{{ tenant.name }}</p>
                    <p class="text-sm text-gray-500">{{ tenant.email || '-' }}</p>
                  </div>
                </div>
              </td>
              <td class="py-3 px-4 text-gray-600">{{ tenant.slug }}</td>
              <td class="py-3 px-4">
                <span :class="getPlanBadge(tenant.plan)">{{ tenant.plan }}</span>
              </td>
              <td class="py-3 px-4">
                <span :class="getStatusBadge(tenant.status)">{{ tenant.status }}</span>
              </td>
              <td class="py-3 px-4 text-gray-500 text-sm">
                {{ formatDate(tenant.createdAt) }}
              </td>
              <td class="py-3 px-4 text-right">
                <div class="flex justify-end space-x-2">
                  <button @click="viewTenant(tenant)" class="btn btn-secondary text-sm py-1">
                    👁️
                  </button>
                  <button @click="editTenant(tenant)" class="btn btn-secondary text-sm py-1">
                    ✏️
                  </button>
                  <button @click="confirmDelete(tenant)" class="btn btn-danger text-sm py-1">
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.totalPages > 1" class="flex justify-between items-center mt-6">
        <p class="text-sm text-gray-500">
          Page {{ pagination.currentPage }} sur {{ pagination.totalPages }} 
          ({{ pagination.total }} résultats)
        </p>
        <div class="flex space-x-2">
          <button 
            @click="goToPage(pagination.currentPage - 1)"
            :disabled="pagination.currentPage === 1"
            class="btn btn-secondary"
          >
            ←
          </button>
          <button 
            @click="goToPage(pagination.currentPage + 1)"
            :disabled="pagination.currentPage === pagination.totalPages"
            class="btn btn-secondary"
          >
            →
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || showEditModal" 
         class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="card max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 class="text-xl font-bold text-gray-900 mb-6">
          {{ showEditModal ? '✏️ Modifier le Tenant' : '➕ Nouveau Tenant' }}
        </h2>

        <form @submit.prevent="showEditModal ? updateTenant() : createTenant()">
          <div class="space-y-4">
            <div>
              <label class="label">Nom *</label>
              <input v-model="tenantForm.name" type="text" class="input" required />
            </div>

            <div>
              <label class="label">Slug *</label>
              <input v-model="tenantForm.slug" type="text" class="input" required />
            </div>

            <div>
              <label class="label">Email</label>
              <input v-model="tenantForm.email" type="email" class="input" />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Plan</label>
                <select v-model="tenantForm.plan" class="input">
                  <option value="FREE">Free</option>
                  <option value="STARTER">Starter</option>
                  <option value="PROFESSIONAL">Professional</option>
                  <option value="ENTERPRISE">Enterprise</option>
                </select>
              </div>
              <div>
                <label class="label">Status</label>
                <select v-model="tenantForm.status" class="input">
                  <option value="ACTIVE">Active</option>
                  <option value="TRIAL">Trial</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>
            </div>

            <div>
              <label class="label">Type d'organisation</label>
              <input v-model="tenantForm.organizationType" type="text" class="input" placeholder="Restaurant, Hotel, Event..." />
            </div>
          </div>

          <div class="flex justify-end space-x-4 mt-6">
            <button type="button" @click="closeModals" class="btn btn-secondary">
              Annuler
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Enregistrement...' : 'Enregistrer' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '@/lib/api'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()

const loading = ref(true)
const saving = ref(false)
const tenants = ref([])
const showCreateModal = ref(false)
const showEditModal = ref(false)
const selectedTenant = ref(null)

const filters = reactive({
  search: '',
  plan: '',
  status: ''
})

const pagination = reactive({
  currentPage: 1,
  totalPages: 1,
  total: 0,
  perPage: 10
})

const tenantForm = reactive({
  name: '',
  slug: '',
  email: '',
  plan: 'FREE',
  status: 'ACTIVE',
  organizationType: ''
})

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('fr-FR')
}

const getPlanBadge = (plan) => {
  const badges = {
    FREE: 'badge badge-info',
    STARTER: 'badge badge-success',
    PROFESSIONAL: 'badge badge-warning',
    ENTERPRISE: 'badge bg-purple-100 text-purple-800'
  }
  return badges[plan] || 'badge'
}

const getStatusBadge = (status) => {
  const badges = {
    ACTIVE: 'badge badge-success',
    TRIAL: 'badge badge-warning',
    SUSPENDED: 'badge badge-danger',
    CANCELLED: 'badge bg-gray-100 text-gray-800'
  }
  return badges[status] || 'badge'
}

let searchTimeout = null
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    loadTenants()
  }, 300)
}

const loadTenants = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: pagination.currentPage,
      perPage: pagination.perPage
    })
    
    if (filters.search) params.append('search', filters.search)
    if (filters.plan) params.append('plan', filters.plan)
    if (filters.status) params.append('status', filters.status)

    const response = await api.get(`/tenants?${params}`)
    tenants.value = response.data.data || response.data
    
    if (response.data.meta) {
      pagination.currentPage = response.data.meta.current_page
      pagination.totalPages = response.data.meta.total_pages
      pagination.total = response.data.meta.total
    }
  } catch (e) {
    console.error('Error loading tenants:', e)
    toastStore.error('Erreur lors du chargement des tenants')
  } finally {
    loading.value = false
  }
}

const resetFilters = () => {
  filters.search = ''
  filters.plan = ''
  filters.status = ''
  pagination.currentPage = 1
  loadTenants()
}

const goToPage = (page) => {
  pagination.currentPage = page
  loadTenants()
}

const resetForm = () => {
  tenantForm.name = ''
  tenantForm.slug = ''
  tenantForm.email = ''
  tenantForm.plan = 'FREE'
  tenantForm.status = 'ACTIVE'
  tenantForm.organizationType = ''
}

const closeModals = () => {
  showCreateModal.value = false
  showEditModal.value = false
  selectedTenant.value = null
  resetForm()
}

const createTenant = async () => {
  saving.value = true
  try {
    await api.post('/tenants', tenantForm)
    toastStore.success('Tenant créé avec succès')
    closeModals()
    loadTenants()
  } catch (e) {
    console.error('Error creating tenant:', e)
    toastStore.error(e.response?.data?.message || 'Erreur lors de la création')
  } finally {
    saving.value = false
  }
}

const editTenant = (tenant) => {
  selectedTenant.value = tenant
  tenantForm.name = tenant.name
  tenantForm.slug = tenant.slug
  tenantForm.email = tenant.email || ''
  tenantForm.plan = tenant.plan
  tenantForm.status = tenant.status
  tenantForm.organizationType = tenant.organizationType || ''
  showEditModal.value = true
}

const updateTenant = async () => {
  saving.value = true
  try {
    await api.patch(`/tenants/${selectedTenant.value.id}`, tenantForm)
    toastStore.success('Tenant mis à jour avec succès')
    closeModals()
    loadTenants()
  } catch (e) {
    console.error('Error updating tenant:', e)
    toastStore.error(e.response?.data?.message || 'Erreur lors de la mise à jour')
  } finally {
    saving.value = false
  }
}

const viewTenant = (tenant) => {
  // Could navigate to a detail page
  console.log('View tenant:', tenant)
}

const confirmDelete = async (tenant) => {
  if (confirm(`Êtes-vous sûr de vouloir supprimer "${tenant.name}" ?`)) {
    try {
      await api.delete(`/tenants/${tenant.id}`)
      toastStore.success('Tenant supprimé')
      loadTenants()
    } catch (e) {
      console.error('Error deleting tenant:', e)
      toastStore.error('Erreur lors de la suppression')
    }
  }
}

onMounted(() => {
  loadTenants()
})
</script>
