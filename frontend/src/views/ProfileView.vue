<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">👤 Mon Profil</h1>
      <p class="text-white/70 mt-1">Gérez vos informations personnelles</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Profile Card -->
      <div class="lg:col-span-1">
        <div class="card text-center">
          <div class="w-24 h-24 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-full mx-auto flex items-center justify-center">
            <span class="text-4xl text-white font-bold">
              {{ userInitials }}
            </span>
          </div>
          <h2 class="mt-4 text-xl font-bold text-gray-900">{{ profile?.fullName || 'Utilisateur' }}</h2>
          <p class="text-gray-500">{{ profile?.email }}</p>
          <span class="badge badge-success mt-2">{{ profile?.role || 'VIEWER' }}</span>
        </div>
      </div>

      <!-- Profile Details -->
      <div class="lg:col-span-2">
        <div class="card">
          <h2 class="text-xl font-bold text-gray-900 mb-6">Informations du compte</h2>

          <div v-if="loading" class="text-center py-8">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          </div>

          <div v-else class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Prénom</label>
                <p class="text-gray-900 font-medium">{{ profile?.firstName || '-' }}</p>
              </div>
              <div>
                <label class="label">Nom</label>
                <p class="text-gray-900 font-medium">{{ profile?.lastName || '-' }}</p>
              </div>
            </div>

            <div>
              <label class="label">Email</label>
              <p class="text-gray-900 font-medium">{{ profile?.email || '-' }}</p>
            </div>

            <div>
              <label class="label">Rôle</label>
              <span :class="getRoleBadge(profile?.role)">{{ profile?.role || 'VIEWER' }}</span>
            </div>

            <div>
              <label class="label">Tenant</label>
              <p class="text-gray-900 font-medium">{{ profile?.tenantId || '-' }}</p>
            </div>

            <div>
              <label class="label">Membre depuis</label>
              <p class="text-gray-900 font-medium">{{ formatDate(profile?.createdAt) }}</p>
            </div>
          </div>
        </div>

        <!-- Tenant Info -->
        <div class="card mt-6">
          <h2 class="text-xl font-bold text-gray-900 mb-6">🏢 Organisation</h2>
          
          <div v-if="tenant" class="space-y-4">
            <div class="flex items-center space-x-4">
              <div class="w-16 h-16 bg-primary-100 rounded-lg flex items-center justify-center">
                <span class="text-2xl text-primary-600 font-bold">{{ tenant.name?.charAt(0) }}</span>
              </div>
              <div>
                <h3 class="font-bold text-gray-900">{{ tenant.name }}</h3>
                <p class="text-gray-500">{{ tenant.slug }}</p>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <label class="label">Plan</label>
                <span :class="getPlanBadge(tenant.plan)">{{ tenant.plan }}</span>
              </div>
              <div>
                <label class="label">Status</label>
                <span :class="getStatusBadge(tenant.status)">{{ tenant.status }}</span>
              </div>
            </div>
          </div>
          
          <div v-else class="text-gray-500">
            Aucune organisation liée
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const loading = ref(true)
const profile = ref(null)
const tenant = ref(null)

const userInitials = computed(() => {
  if (profile.value?.firstName && profile.value?.lastName) {
    return `${profile.value.firstName.charAt(0)}${profile.value.lastName.charAt(0)}`
  }
  if (profile.value?.email) {
    return profile.value.email.charAt(0).toUpperCase()
  }
  return 'U'
})

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

const getRoleBadge = (role) => {
  const badges = {
    ADMIN: 'badge bg-purple-100 text-purple-800',
    MANAGER: 'badge badge-warning',
    STAFF: 'badge badge-info',
    VIEWER: 'badge bg-gray-100 text-gray-800'
  }
  return badges[role] || 'badge'
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

const loadProfile = async () => {
  loading.value = true
  try {
    // First, use Supabase user data as base
    const supabaseUser = authStore.user
    if (supabaseUser) {
      profile.value = {
        email: supabaseUser.email,
        firstName: supabaseUser.user_metadata?.firstName || supabaseUser.user_metadata?.first_name || '',
        lastName: supabaseUser.user_metadata?.lastName || supabaseUser.user_metadata?.last_name || '',
        fullName: supabaseUser.user_metadata?.fullName || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Utilisateur',
        role: supabaseUser.user_metadata?.role || 'VIEWER',
        createdAt: supabaseUser.created_at,
        id: supabaseUser.id
      }
    }

    // Try to get more data from API
    try {
      const response = await api.get('/me')
      if (response.data) {
        profile.value = { ...profile.value, ...response.data }
        
        // Load tenant info from /me/tenant endpoint
        if (response.data.tenantId) {
          try {
            const tenantResponse = await api.get('/me/tenant')
            tenant.value = tenantResponse.data
          } catch (e) {
            console.warn('Could not load tenant:', e.message)
          }
        }
      }
    } catch (e) {
      console.warn('API /me not available, using Supabase data:', e.message)
    }
  } catch (e) {
    console.error('Error loading profile:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadProfile()
})
</script>
