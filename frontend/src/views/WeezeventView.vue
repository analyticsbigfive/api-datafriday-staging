<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">🎫 Weezevent</h1>
      <p class="text-white/70 mt-1">Synchronisation et gestion des données Weezevent</p>
    </div>

    <!-- Sync Controls -->
    <div class="card mb-6">
      <h2 class="text-xl font-bold text-gray-900 mb-4">🔄 Synchronisation</h2>
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

      <div v-if="syncResult" class="mt-4 p-4 rounded-lg" :class="syncResult.success ? 'bg-green-50' : 'bg-red-50'">
        <p :class="syncResult.success ? 'text-green-700' : 'text-red-700'">
          {{ syncResult.message }}
        </p>
        <pre v-if="syncResult.data" class="mt-2 text-sm overflow-x-auto">{{ JSON.stringify(syncResult.data, null, 2) }}</pre>
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
const syncing = ref(false)
const syncResult = ref(null)

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
    refunded: 'badge badge-info'
  }
  return badges[status?.toLowerCase()] || 'badge'
}

const syncEvents = async () => {
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { types: ['events'] })
    syncResult.value = { success: true, message: 'Événements synchronisés', data: response.data }
    loadEvents()
    toastStore.success('Événements synchronisés')
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const syncProducts = async () => {
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { types: ['products'] })
    syncResult.value = { success: true, message: 'Produits synchronisés', data: response.data }
    loadProducts()
    toastStore.success('Produits synchronisés')
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const syncTransactions = async () => {
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { types: ['transactions'] })
    syncResult.value = { success: true, message: 'Transactions synchronisées', data: response.data }
    loadTransactions()
    toastStore.success('Transactions synchronisées')
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
  } finally {
    syncing.value = false
  }
}

const syncAll = async () => {
  syncing.value = true
  syncResult.value = null
  try {
    const response = await api.post('/weezevent/sync', { types: ['events', 'products', 'transactions'] })
    syncResult.value = { success: true, message: 'Synchronisation complète', data: response.data }
    loadEvents()
    loadProducts()
    loadTransactions()
    toastStore.success('Synchronisation complète réussie')
  } catch (e) {
    syncResult.value = { success: false, message: e.response?.data?.message || e.message }
    toastStore.error('Erreur de synchronisation')
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

onMounted(() => {
  loadEvents()
})
</script>
