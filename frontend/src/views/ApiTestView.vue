<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">🔧 API Test Console</h1>
      <p class="text-white/70 mt-1">Testez les endpoints de l'API directement</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Request Builder -->
      <div class="card">
        <h2 class="text-xl font-bold text-gray-900 mb-4">📤 Requête</h2>

        <div class="space-y-4">
          <div>
            <label class="label">Méthode</label>
            <select v-model="request.method" class="input">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div>
            <label class="label">Endpoint</label>
            <div class="flex">
              <span class="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                {{ apiUrl }}
              </span>
              <input 
                v-model="request.endpoint" 
                type="text" 
                class="input rounded-l-none flex-1" 
                placeholder="/health"
              />
            </div>
          </div>

          <div v-if="['POST', 'PATCH'].includes(request.method)">
            <label class="label">Body (JSON)</label>
            <textarea 
              v-model="request.body" 
              class="input font-mono text-sm"
              rows="6"
              placeholder='{ "key": "value" }'
            ></textarea>
          </div>

          <button @click="sendRequest" class="btn btn-primary w-full" :disabled="loading">
            {{ loading ? '⏳ Envoi...' : '🚀 Envoyer la requête' }}
          </button>
        </div>

        <!-- Quick Actions -->
        <div class="mt-6 pt-6 border-t border-gray-200">
          <h3 class="font-medium text-gray-900 mb-3">⚡ Actions rapides</h3>
          <div class="flex flex-wrap gap-2">
            <button @click="quickRequest('GET', '/health')" class="btn btn-secondary text-sm">
              Health Check
            </button>
            <button @click="quickRequest('GET', '/me')" class="btn btn-secondary text-sm">
              Mon Profil
            </button>
            <button @click="quickRequest('GET', '/tenants')" class="btn btn-secondary text-sm">
              Tenants
            </button>
            <button @click="quickRequest('GET', '/weezevent/events')" class="btn btn-secondary text-sm">
              Weezevent Events
            </button>
            <button @click="quickRequest('GET', '/weezevent/transactions')" class="btn btn-secondary text-sm">
              Transactions
            </button>
          </div>
        </div>
      </div>

      <!-- Response Viewer -->
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold text-gray-900">📥 Réponse</h2>
          <div v-if="response.status" class="flex items-center space-x-2">
            <span :class="getStatusClass(response.status)">
              {{ response.status }} {{ response.statusText }}
            </span>
            <span class="text-sm text-gray-500">{{ response.time }}ms</span>
          </div>
        </div>

        <div v-if="!response.data && !loading" class="text-center py-12 text-gray-500">
          Envoyez une requête pour voir la réponse
        </div>

        <div v-else-if="loading" class="text-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
        </div>

        <div v-else>
          <!-- Headers -->
          <div class="mb-4">
            <button 
              @click="showHeaders = !showHeaders" 
              class="text-sm text-primary-600 hover:text-primary-700"
            >
              {{ showHeaders ? '▼' : '▶' }} Headers
            </button>
            <pre v-if="showHeaders" class="mt-2 p-3 bg-gray-100 rounded-lg text-xs overflow-x-auto">{{ JSON.stringify(response.headers, null, 2) }}</pre>
          </div>

          <!-- Body -->
          <div class="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre class="text-green-400 text-sm">{{ formatJson(response.data) }}</pre>
          </div>
        </div>

        <div class="mt-4 flex space-x-2">
          <button 
            @click="copyToClipboard" 
            class="btn btn-secondary flex-1"
            :disabled="!response.data"
          >
            📋 Copier
          </button>
          <button 
            @click="clearResponse" 
            class="btn btn-secondary flex-1"
          >
            🗑️ Effacer
          </button>
        </div>
      </div>
    </div>

    <!-- Request History -->
    <div class="card mt-6">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-gray-900">📜 Historique</h2>
        <button @click="clearHistory" class="text-sm text-red-600 hover:text-red-700">
          Effacer l'historique
        </button>
      </div>

      <div v-if="history.length === 0" class="text-center py-4 text-gray-500">
        Aucune requête dans l'historique
      </div>

      <div v-else class="space-y-2">
        <div 
          v-for="(item, index) in history.slice(0, 10)" 
          :key="index"
          @click="loadFromHistory(item)"
          class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
        >
          <div class="flex items-center space-x-3">
            <span :class="getMethodBadge(item.method)">{{ item.method }}</span>
            <span class="font-mono text-sm">{{ item.endpoint }}</span>
          </div>
          <div class="flex items-center space-x-2">
            <span :class="getStatusClass(item.status)">{{ item.status }}</span>
            <span class="text-sm text-gray-500">{{ item.time }}ms</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import api from '@/lib/api'
import { config } from '@/config'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()

const apiUrl = computed(() => config.apiUrl)

const request = reactive({
  method: 'GET',
  endpoint: '/health',
  body: ''
})

const response = reactive({
  status: null,
  statusText: '',
  headers: {},
  data: null,
  time: 0
})

const loading = ref(false)
const showHeaders = ref(false)
const history = ref([])

const sendRequest = async () => {
  loading.value = true
  const startTime = performance.now()

  try {
    let result
    const options = {}

    if (['POST', 'PATCH'].includes(request.method) && request.body) {
      try {
        options.data = JSON.parse(request.body)
      } catch (e) {
        toastStore.error('JSON invalide dans le body')
        loading.value = false
        return
      }
    }

    result = await api.request({
      method: request.method.toLowerCase(),
      url: request.endpoint,
      ...options
    })

    response.status = result.status
    response.statusText = result.statusText
    response.headers = result.headers
    response.data = result.data
    response.time = Math.round(performance.now() - startTime)

    // Add to history
    history.value.unshift({
      method: request.method,
      endpoint: request.endpoint,
      status: result.status,
      time: response.time
    })

  } catch (e) {
    response.status = e.response?.status || 500
    response.statusText = e.response?.statusText || 'Error'
    response.headers = e.response?.headers || {}
    response.data = e.response?.data || { error: e.message }
    response.time = Math.round(performance.now() - startTime)

    history.value.unshift({
      method: request.method,
      endpoint: request.endpoint,
      status: response.status,
      time: response.time
    })
  } finally {
    loading.value = false
  }
}

const quickRequest = (method, endpoint) => {
  request.method = method
  request.endpoint = endpoint
  request.body = ''
  sendRequest()
}

const formatJson = (data) => {
  try {
    return JSON.stringify(data, null, 2)
  } catch (e) {
    return String(data)
  }
}

const getStatusClass = (status) => {
  if (status >= 200 && status < 300) return 'badge badge-success'
  if (status >= 400 && status < 500) return 'badge badge-warning'
  if (status >= 500) return 'badge badge-danger'
  return 'badge'
}

const getMethodBadge = (method) => {
  const badges = {
    GET: 'badge badge-success',
    POST: 'badge badge-info',
    PATCH: 'badge badge-warning',
    DELETE: 'badge badge-danger'
  }
  return badges[method] || 'badge'
}

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(formatJson(response.data))
    toastStore.success('Copié dans le presse-papier')
  } catch (e) {
    toastStore.error('Erreur lors de la copie')
  }
}

const clearResponse = () => {
  response.status = null
  response.statusText = ''
  response.headers = {}
  response.data = null
  response.time = 0
}

const clearHistory = () => {
  history.value = []
}

const loadFromHistory = (item) => {
  request.method = item.method
  request.endpoint = item.endpoint
}
</script>
