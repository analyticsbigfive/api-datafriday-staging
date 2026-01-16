<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">🎫 Weezevent</h1>
      <p class="text-white/70 mt-1">Synchronisation et gestion des données Weezevent</p>
    </div>

    <!-- Tenant Selector -->
    <div class="card mb-6">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <label class="label">🏢 Sélectionner le tenant à synchroniser</label>
          <select 
            v-model="selectedTenantId" 
            @change="onTenantChange"
            class="input max-w-md"
            :disabled="loadingTenants"
          >
            <option value="">-- Choisir un tenant --</option>
            <option 
              v-for="tenant in availableTenants" 
              :key="tenant.id" 
              :value="tenant.id"
            >
              {{ tenant.name }} ({{ tenant.slug }})
              {{ tenant.weezeventEnabled ? '✅' : '❌ Weezevent non activé' }}
            </option>
          </select>
          <p v-if="selectedTenant" class="text-sm text-gray-500 mt-2">
            <span v-if="selectedTenant.weezeventEnabled" class="text-green-600">
              ✅ Weezevent activé - Organization ID: {{ selectedTenant.weezeventOrganizationId }}
            </span>
            <span v-else class="text-red-600">
              ❌ Weezevent n'est pas activé sur ce tenant
            </span>
          </p>
        </div>
        <button @click="loadTenants" class="btn btn-secondary ml-4" :disabled="loadingTenants">
          {{ loadingTenants ? '⏳...' : '🔄 Recharger' }}
        </button>
      </div>
    </div>

    <!-- Sync Status Card -->
    <div class="card mb-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-gray-900">📊 État de la synchronisation</h2>
        <button @click="loadSyncStatus" class="btn btn-secondary text-sm" :disabled="loadingStatus">
          {{ loadingStatus ? '⏳...' : '🔄 Rafraîchir' }}
        </button>
      </div>
      
      <div v-if="syncStatus" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div v-for="(status, type) in syncStatus" :key="type" class="bg-gray-50 rounded-lg p-4">
          <h3 class="font-medium text-gray-700 capitalize">{{ type }}</h3>
          <div class="mt-2 space-y-1 text-sm">
            <p><span class="text-gray-500">Dernier sync:</span> {{ formatDate(status.lastSyncedAt) }}</p>
            <p><span class="text-gray-500">Items synchronisés:</span> {{ status.lastSyncCount || 0 }}</p>
            <p><span class="text-gray-500">Total:</span> {{ status.totalSynced || 0 }}</p>
            <p v-if="status.lastError" class="text-red-600">❌ {{ status.lastError }}</p>
          </div>
        </div>
      </div>
      <div v-else class="text-center py-4 text-gray-500">
        Chargement du statut...
      </div>
    </div>

    <!-- Sync Controls -->
    <div class="card mb-6">
      <h2 class="text-xl font-bold text-gray-900 mb-4">🔄 Synchronisation</h2>
      
      <!-- Mode Toggle -->
      <div class="mb-4 p-3 bg-blue-50 rounded-lg">
        <label class="flex items-center space-x-3">
          <input type="checkbox" v-model="forceFullSync" class="h-4 w-4 text-primary-600 rounded" />
          <span class="text-sm text-gray-700">
            <strong>Forcer sync complet</strong> (ignore l'état incrémental, re-télécharge tout)
          </span>
        </label>
      </div>

      <div class="flex flex-wrap gap-4">
        <button @click="syncEvents" class="btn btn-primary" :disabled="syncing">
          {{ syncing ? '⏳ Sync...' : '🎫 Sync Événements' }}
        </button>
        <button @click="syncProducts" class="btn btn-primary" :disabled="syncing">
          {{ syncing ? '⏳ Sync...' : '🛒 Sync Produits' }}
        </button>
        <button @click="syncTransactions" class="btn btn-primary" :disabled="syncing">
          {{ syncing ? '⏳ Sync...' : '💳 Sync Transactions' }}
        </button>
        <button @click="syncAll" class="btn btn-success" :disabled="syncing">
          {{ syncing ? '⏳ Sync...' : '🔄 Sync Complet' }}
        </button>
      </div>

      <!-- Reset Sync State -->
      <div class="mt-4 pt-4 border-t border-gray-200">
        <button @click="resetSyncState" class="btn btn-danger text-sm" :disabled="syncing">
          🗑️ Reset état de sync (force full sync au prochain)
        </button>
      </div>

      <div v-if="syncResult" class="mt-4 p-4 rounded-lg" :class="syncResult.success ? 'bg-green-50' : 'bg-red-50'">
        <p :class="syncResult.success ? 'text-green-700' : 'text-red-700'" class="font-medium">
          {{ syncResult.message }}
        </p>
        <div v-if="syncResult.data" class="mt-2 text-sm">
          <p v-if="syncResult.data.isIncremental !== undefined">
            Mode: <strong>{{ syncResult.data.isIncremental ? 'INCRÉMENTAL ⚡' : 'COMPLET 📦' }}</strong>
          </p>
          <p v-if="syncResult.data.itemsSynced !== undefined">
            Items synchronisés: <strong>{{ syncResult.data.itemsSynced }}</strong>
            ({{ syncResult.data.itemsCreated || 0 }} nouveaux, {{ syncResult.data.itemsUpdated || 0 }} mis à jour, {{ syncResult.data.itemsSkipped || 0 }} ignorés)
          </p>
          <p v-if="syncResult.data.duration">Durée: <strong>{{ syncResult.data.duration }}ms</strong></p>
          <p v-if="syncResult.data.hasMore" class="text-orange-600">⚠️ Plus de données disponibles, le prochain sync continuera</p>
        </div>
        <pre v-if="showRawResult" class="mt-2 text-xs overflow-x-auto bg-gray-100 p-2 rounded">{{ JSON.stringify(syncResult.data, null, 2) }}</pre>
        <button @click="showRawResult = !showRawResult" class="text-xs text-primary-600 mt-2">
          {{ showRawResult ? 'Masquer' : 'Voir' }} JSON brut
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="card">
      <div class="border-b border-gray-200 mb-6">
        <nav class="flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm',
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]"
          >
            {{ tab.icon }} {{ tab.name }}
          </button>
        </nav>
      </div>

      <!-- Events Tab -->
      <div v-if="activeTab === 'events'">
        <div v-if="loading" class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
        </div>
        <div v-else-if="events.length === 0" class="text-center py-8 text-gray-500">
          Aucun événement synchronisé
        </div>
        <div v-else class="space-y-4">
          <div v-for="event in events" :key="event.id" class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-bold text-gray-900">{{ event.name }}</h3>
                <p class="text-sm text-gray-500">ID: {{ event.weezeventId }}</p>
                <p class="text-sm text-gray-500">
                  {{ formatDate(event.startDate) }} - {{ formatDate(event.endDate) }}
                </p>
              </div>
              <span class="badge badge-success">{{ event.status || 'Active' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Products Tab -->
      <div v-if="activeTab === 'products'">
        <div v-if="loading" class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
        </div>
        <div v-else-if="products.length === 0" class="text-center py-8 text-gray-500">
          Aucun produit synchronisé
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="product in products" :key="product.id" class="border border-gray-200 rounded-lg p-4">
            <h3 class="font-bold text-gray-900">{{ product.name }}</h3>
            <p class="text-sm text-gray-500">{{ product.category || 'Non catégorisé' }}</p>
            <p class="text-lg font-bold text-primary-600 mt-2">
              {{ formatPrice(product.basePrice) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Transactions Tab -->
      <div v-if="activeTab === 'transactions'">
        <div v-if="loading" class="text-center py-8">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
        </div>
        <div v-else-if="transactions.length === 0" class="text-center py-8 text-gray-500">
          Aucune transaction synchronisée
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-gray-200">
                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">ID</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Date</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Montant</th>
                <th class="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in transactions" :key="tx.id" class="border-b border-gray-100">
                <td class="py-3 px-4 font-mono text-sm">{{ tx.weezeventId }}</td>
                <td class="py-3 px-4 text-sm">{{ formatDate(tx.transactionDate) }}</td>
                <td class="py-3 px-4 font-bold">{{ formatPrice(tx.totalAmount) }}</td>
                <td class="py-3 px-4">
                  <span :class="getStatusBadge(tx.status)">{{ tx.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="transactionsPagination.totalPages > 1" class="flex justify-between items-center mt-6">
          <p class="text-sm text-gray-500">
            Page {{ transactionsPagination.currentPage }} sur {{ transactionsPagination.totalPages }}
          </p>
          <div class="flex space-x-2">
            <button 
              @click="loadTransactions(transactionsPagination.currentPage - 1)"
              :disabled="transactionsPagination.currentPage === 1"
              class="btn btn-secondary"
            >
              ←
            </button>
            <button 
              @click="loadTransactions(transactionsPagination.currentPage + 1)"
              :disabled="transactionsPagination.currentPage === transactionsPagination.totalPages"
              class="btn btn-secondary"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import api from '@/lib/api'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()

const tabs = [
  { id: 'events', name: 'Événements', icon: '🎫' },
  { id: 'products', name: 'Produits', icon: '🛒' },
  { id: 'transactions', name: 'Transactions', icon: '💳' }
]

const activeTab = ref('events')
const loading = ref(false)
const loadingStatus = ref(false)
const loadingTenants = ref(false)
const syncing = ref(false)
const syncResult = ref(null)
const showRawResult = ref(false)
const forceFullSync = ref(false)
const syncStatus = ref(null)

// Tenant selection
const availableTenants = ref([])
const selectedTenantId = ref('')
const selectedTenant = ref(null)

const events = ref([])
const products = ref([])
const transactions = ref([])

const transactionsPagination = reactive({
  currentPage: 1,
  totalPages: 1,
  total: 0
})

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatPrice = (price) => {
  if (!price) return '0,00 €'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(price)
}

const getStatusBadge = (status) => {
  const badges = {
    completed: 'badge badge-success',
    pending: 'badge badge-warning',
    failed: 'badge badge-danger',
    refunded: 'badge badge-info',
    V: 'badge badge-success',
    W: 'badge badge-warning',
    C: 'badge badge-danger',
    R: 'badge badge-info'
  }
  return badges[status?.toUpperCase?.()] || badges[status?.toLowerCase?.()] || 'badge'
}

const loadTenants = async () => {
  loadingTenants.value = true
  try {
    const response = await api.get('/tenants?limit=100')
    availableTenants.value = response.data.data || response.data
    
    // Auto-select first tenant with Weezevent enabled
    if (!selectedTenantId.value && availableTenants.value.length > 0) {
      const weezeventTenant = availableTenants.value.find(t => t.weezeventEnabled)
      if (weezeventTenant) {
        selectedTenantId.value = weezeventTenant.id
        selectedTenant.value = weezeventTenant
      }
    }
  } catch (e) {
    console.error('Error loading tenants:', e)
    toastStore.error('Erreur lors du chargement des tenants')
  } finally {
    loadingTenants.value = false
  }
}

const onTenantChange = () => {
  selectedTenant.value = availableTenants.value.find(t => t.id === selectedTenantId.value)
  
  if (!selectedTenant.value?.weezeventEnabled) {
    toastStore.warning('Ce tenant n\'a pas Weezevent activé')
  } else {
    // Reload data for new tenant
    loadSyncStatus()
    loadEvents()
  }
}

const loadSyncStatus = async () => {
  if (!selectedTenantId.value) {
    syncStatus.value = null
    return
  }
  
  loadingStatus.value = true
  try {
    const response = await api.get(`/weezevent/sync/status?tenantId=${selectedTenantId.value}`)
    syncStatus.value = response.data
  } catch (e) {
    console.error('Error loading sync status:', e)
  } finally {
    loadingStatus.value = false
  }
}

const syncEvents = async () => {
  if (!selectedTenantId.value) {
    toastStore.error('Veuillez sélectionner un tenant')
    return
  }
  
  if (!selectedTenant.value?.weezeventEnabled) {
    toastStore.error('Weezevent n\'est pas activé sur ce tenant')
    return
  }
  
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { 
      type: 'events',
      full: forceFullSync.value,
      tenantId: selectedTenantId.value
    })
    syncResult.value = { success: true, message: 'Événements synchronisés', data: response.data }
    loadEvents()
    loadSyncStatus()
    toastStore.success(`Événements synchronisés (${response.data.itemsSynced || 0} items)`)
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const syncProducts = async () => {
  if (!selectedTenantId.value || !selectedTenant.value?.weezeventEnabled) {
    toastStore.error('Veuillez sélectionner un tenant avec Weezevent activé')
    return
  }
  
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { 
      type: 'products',
      tenantId: selectedTenantId.value 
    })
    syncResult.value = { success: true, message: 'Produits synchronisés', data: response.data }
    loadProducts()
    loadSyncStatus()
    toastStore.success(`Produits synchronisés (${response.data.itemsSynced || 0} items)`)
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const syncTransactions = async () => {
  if (!selectedTenantId.value || !selectedTenant.value?.weezeventEnabled) {
    toastStore.error('Veuillez sélectionner un tenant avec Weezevent activé')
    return
  }
  
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { 
      type: 'transactions',
      full: forceFullSync.value,
      tenantId: selectedTenantId.value
    })
    syncResult.value = { success: true, message: 'Transactions synchronisées', data: response.data }
    loadTransactions()
    loadSyncStatus()
    toastStore.success(`Transactions synchronisées (${response.data.itemsSynced || 0} items)`)
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const syncAll = async () => {
  if (!selectedTenantId.value || !selectedTenant.value?.weezeventEnabled) {
    toastStore.error('Veuillez sélectionner un tenant avec Weezevent activé')
    return
  }
  
  syncing.value = true
  syncResult.value = null
  try {
    const tenantId = selectedTenantId.value
    // Sync events
    const eventsRes = await api.post('/weezevent/sync', { type: 'events', full: forceFullSync.value, tenantId })
    // Sync products
    const productsRes = await api.post('/weezevent/sync', { type: 'products', tenantId })
    // Sync transactions
    const transactionsRes = await api.post('/weezevent/sync', { type: 'transactions', full: forceFullSync.value, tenantId })
    
    syncResult.value = { 
      success: true, 
      message: 'Synchronisation complète', 
      data: {
        events: eventsRes.data,
        products: productsRes.data,
        transactions: transactionsRes.data,
        totalSynced: (eventsRes.data.itemsSynced || 0) + (productsRes.data.itemsSynced || 0) + (transactionsRes.data.itemsSynced || 0)
      }
    }
    loadEvents()
    loadProducts()
    loadTransactions()
    loadSyncStatus()
    toastStore.success('Synchronisation complète réussie')
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const resetSyncState = async () => {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser l\'état de synchronisation ? Le prochain sync sera complet.')) {
    return
  }
  syncing.value = true
  try {
    await api.delete('/weezevent/sync/state')
    toastStore.success('État de sync réinitialisé')
    loadSyncStatus()
  } catch (e) {
    toastStore.error('Erreur: ' + (e.response?.data?.message || e.message))
  } finally {
    syncing.value = false
  }
}

const loadEvents = async () => {
  loading.value = true
  try {
    const response = await api.get('/weezevent/events')
    events.value = response.data.data || response.data || []
  } catch (e) {
    console.error('Error loading events:', e)
  } finally {
    loading.value = false
  }
}

const loadProducts = async () => {
  loading.value = true
  try {
    const response = await api.get('/weezevent/products')
    products.value = response.data.data || response.data || []
  } catch (e) {
    console.error('Error loading products:', e)
  } finally {
    loading.value = false
  }
}

const loadTransactions = async (page = 1) => {
  loading.value = true
  try {
    const response = await api.get(`/weezevent/transactions?page=${page}&perPage=20`)
    transactions.value = response.data.data || []
    if (response.data.meta) {
      transactionsPagination.currentPage = response.data.meta.current_page
      transactionsPagination.totalPages = response.data.meta.total_pages
      transactionsPagination.total = response.data.meta.total
    }
  } catch (e) {
    console.error('Error loading transactions:', e)
  } finally {
    loading.value = false
  }
}

watch(activeTab, (newTab) => {
  if (newTab === 'events' && events.value.length === 0) loadEvents()
  if (newTab === 'products' && products.value.length === 0) loadProducts()
  if (newTab === 'transactions' && transactions.value.length === 0) loadTransactions()
})

onMounted(async () => {
  await loadTenants()
  if (selectedTenantId.value) {
    loadSyncStatus()
    loadEvents()
  }
})
</script>
