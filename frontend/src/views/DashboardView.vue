<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">📊 Dashboard</h1>
      <p class="text-white/70 mt-1">Vue d'ensemble de votre plateforme</p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div v-if="isAdmin" class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Tenants</p>
            <p class="text-3xl font-bold text-gray-900">{{ stats.tenants }}</p>
          </div>
          <span class="text-4xl">🏢</span>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Événements</p>
            <p class="text-3xl font-bold text-gray-900">{{ stats.events }}</p>
          </div>
          <span class="text-4xl">🎫</span>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Transactions</p>
            <p class="text-3xl font-bold text-gray-900">{{ stats.transactions }}</p>
          </div>
          <span class="text-4xl">💰</span>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500 font-medium">Status API</p>
            <span :class="['badge', apiStatus ? 'badge-success' : 'badge-danger']">
              {{ apiStatus ? 'En ligne' : 'Hors ligne' }}
            </span>
          </div>
          <span class="text-4xl">{{ apiStatus ? '✅' : '❌' }}</span>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div class="card">
        <h2 class="text-xl font-bold text-gray-900 mb-4">⚡ Actions Rapides</h2>
        <div class="grid grid-cols-2 gap-4">
          <router-link v-if="isAdmin" to="/tenants" class="btn btn-primary text-center">
            🏢 Gérer les Tenants
          </router-link>
          <router-link to="/spaces" class="btn btn-primary text-center">
            🏗️ Mes Espaces
          </router-link>
          <router-link to="/weezevent" class="btn btn-primary text-center">
            🎫 Weezevent Sync
          </router-link>
          <router-link to="/api-test" class="btn btn-secondary text-center">
            🔧 Tester l'API
          </router-link>
          <router-link to="/profile" class="btn btn-secondary text-center">
            👤 Mon Profil
          </router-link>
        </div>
      </div>

      <div class="card">
        <h2 class="text-xl font-bold text-gray-900 mb-4">📡 État de l'API</h2>
        <div v-if="loading" class="text-gray-500">Chargement...</div>
        <div v-else-if="healthData" class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-600">Status</span>
            <span class="font-medium text-green-600">{{ healthData.status }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Version</span>
            <span class="font-medium">{{ healthData.version }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Phase</span>
            <span class="font-medium text-sm">{{ healthData.phase }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Timestamp</span>
            <span class="font-medium text-sm">{{ formatDate(healthData.timestamp) }}</span>
          </div>
        </div>
        <div v-else class="text-red-500">
          ❌ Impossible de joindre l'API
        </div>
        <button @click="checkHealth" class="btn btn-secondary w-full mt-4">
          🔄 Rafraîchir
        </button>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="card">
      <h2 class="text-xl font-bold text-gray-900 mb-4">📜 Activité Récente</h2>
      <div class="space-y-4">
        <div v-for="activity in recentActivity" :key="activity.id" 
             class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
          <div class="flex items-center space-x-3">
            <span class="text-2xl">{{ activity.icon }}</span>
            <div>
              <p class="font-medium text-gray-900">{{ activity.title }}</p>
              <p class="text-sm text-gray-500">{{ activity.description }}</p>
            </div>
          </div>
          <span class="text-sm text-gray-400">{{ activity.time }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/lib/api'
import { config } from '@/config'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.dbUser?.role === 'ADMIN')

const loading = ref(true)
const apiStatus = ref(false)
const healthData = ref(null)

const stats = ref({
  tenants: 0,
  events: 0,
  transactions: 0
})

const recentActivity = ref([
  { id: 1, icon: '🔐', title: 'Connexion', description: 'Vous vous êtes connecté', time: 'À l\'instant' },
  { id: 2, icon: '📊', title: 'Dashboard', description: 'Consultation du dashboard', time: 'À l\'instant' }
])

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('fr-FR')
}

const checkHealth = async () => {
  loading.value = true
  try {
    // Use direct URL to avoid proxy issues
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
    const response = await fetch(`${apiUrl}/health`)
    const data = await response.json()
    healthData.value = data
    apiStatus.value = data.status === 'ok'
  } catch (e) {
    console.error('Health check failed:', e)
    apiStatus.value = false
    healthData.value = null
  } finally {
    loading.value = false
  }
}

const loadStats = async () => {
  // Only admins can see tenant statistics
  if (!isAdmin.value) return
  
  try {
    const response = await api.get('/tenants/statistics')
    if (response.data) {
      stats.value.tenants = response.data.totalTenants || 0
    }
  } catch (e) {
    console.log('Stats not available (permission required)')
  }
}

onMounted(() => {
  checkHealth()
  loadStats()
})
</script>
