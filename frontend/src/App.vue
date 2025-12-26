<template>
  <div class="min-h-screen bg-gradient-to-br from-primary-500 to-secondary-500">
    <!-- Navigation -->
    <nav v-if="authStore.isAuthenticated" class="bg-white/10 backdrop-blur-md border-b border-white/20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <router-link to="/" class="flex items-center space-x-2">
              <span class="text-2xl">🚀</span>
              <span class="text-xl font-bold text-white">DataFriday</span>
            </router-link>
            
            <!-- Nav Links -->
            <div class="hidden md:flex ml-10 space-x-4">
              <router-link 
                v-for="link in navLinks" 
                :key="link.path"
                :to="link.path"
                class="px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                active-class="bg-white/20 text-white"
              >
                {{ link.icon }} {{ link.name }}
              </router-link>
            </div>
          </div>
          
          <!-- User Menu -->
          <div class="flex items-center space-x-4">
            <span class="text-white/80 text-sm">{{ authStore.user?.email }}</span>
            <button @click="handleLogout" class="btn bg-white/20 text-white hover:bg-white/30">
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main :class="authStore.isAuthenticated ? 'py-8' : ''">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- Toast Notifications -->
    <div class="fixed bottom-4 right-4 z-50 space-y-2">
      <transition-group name="slide">
        <div 
          v-for="toast in toasts" 
          :key="toast.id"
          :class="[
            'px-4 py-3 rounded-lg shadow-lg max-w-sm',
            toast.type === 'success' ? 'bg-green-500 text-white' : '',
            toast.type === 'error' ? 'bg-red-500 text-white' : '',
            toast.type === 'info' ? 'bg-blue-500 text-white' : '',
            toast.type === 'warning' ? 'bg-yellow-500 text-white' : ''
          ]"
        >
          {{ toast.message }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const authStore = useAuthStore()
const toastStore = useToastStore()

const toasts = computed(() => toastStore.toasts)

const navLinks = [
  { name: 'Dashboard', path: '/dashboard', icon: '📊' },
  { name: 'Tenants', path: '/tenants', icon: '🏢' },
  { name: 'Weezevent', path: '/weezevent', icon: '🎫' },
  { name: 'Profil', path: '/profile', icon: '👤' },
  { name: 'API Test', path: '/api-test', icon: '🔧' },
]

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}

onMounted(async () => {
  // Check if user is already authenticated
  await authStore.checkAuth()
})
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
