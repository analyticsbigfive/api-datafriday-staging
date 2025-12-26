<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4">
    <div class="card max-w-md w-full">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900">🚀 DataFriday</h1>
        <p class="text-gray-600 mt-2">Connectez-vous à votre compte</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="label">Email</label>
          <input 
            v-model="form.email" 
            type="email" 
            class="input" 
            placeholder="vous@example.com"
            required
          />
        </div>

        <div>
          <label class="label">Mot de passe</label>
          <input 
            v-model="form.password" 
            type="password" 
            class="input" 
            placeholder="••••••••"
            required
          />
        </div>

        <div v-if="errorMessage" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          {{ errorMessage }}
        </div>

        <button 
          type="submit" 
          class="btn btn-primary w-full"
          :disabled="loading"
        >
          <span v-if="loading">Connexion en cours...</span>
          <span v-else>Se connecter</span>
        </button>
      </form>

      <div class="mt-6 text-center">
        <p class="text-gray-600">
          Pas encore de compte ?
          <router-link to="/register" class="text-primary-600 hover:text-primary-700 font-medium">
            S'inscrire
          </router-link>
        </p>
      </div>

      <!-- Demo credentials -->
      <div class="mt-6 p-4 bg-gray-50 rounded-lg">
        <p class="text-sm text-gray-600 font-medium mb-2">🧪 Identifiants de test :</p>
        <p class="text-xs text-gray-500">
          Email: demo@datafriday.io<br>
          Mot de passe: demo123456
        </p>
        <button 
          @click="fillDemo" 
          class="mt-2 text-xs text-primary-600 hover:text-primary-700"
        >
          Remplir automatiquement
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const authStore = useAuthStore()
const toastStore = useToastStore()

const form = reactive({
  email: '',
  password: ''
})

const loading = ref(false)
const errorMessage = ref('')

const handleLogin = async () => {
  loading.value = true
  errorMessage.value = ''

  const result = await authStore.login(form.email, form.password)

  if (result.success) {
    toastStore.success('Connexion réussie !')
    // Redirect to onboarding if user needs to join an organization
    if (result.needsOnboarding) {
      router.push('/onboarding')
    } else {
      router.push('/dashboard')
    }
  } else {
    errorMessage.value = result.error
  }

  loading.value = false
}

const fillDemo = () => {
  form.email = 'demo@datafriday.io'
  form.password = 'demo123456'
}
</script>
