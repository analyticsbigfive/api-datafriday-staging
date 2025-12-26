<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4">
    <div class="card max-w-md w-full">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900">🚀 DataFriday</h1>
        <p class="text-gray-600 mt-2">Créez votre compte</p>
      </div>

      <form @submit.prevent="handleRegister" class="space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Prénom</label>
            <input 
              v-model="form.firstName" 
              type="text" 
              class="input" 
              placeholder="Jean"
              required
            />
          </div>
          <div>
            <label class="label">Nom</label>
            <input 
              v-model="form.lastName" 
              type="text" 
              class="input" 
              placeholder="Dupont"
              required
            />
          </div>
        </div>

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
            minlength="6"
            required
          />
          <p class="text-xs text-gray-500 mt-1">Minimum 6 caractères</p>
        </div>

        <div>
          <label class="label">Confirmer le mot de passe</label>
          <input 
            v-model="form.confirmPassword" 
            type="password" 
            class="input" 
            placeholder="••••••••"
            required
          />
        </div>

        <div v-if="errorMessage" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          {{ errorMessage }}
        </div>

        <div v-if="successMessage" class="bg-green-50 text-green-600 p-3 rounded-lg text-sm">
          {{ successMessage }}
        </div>

        <button 
          type="submit" 
          class="btn btn-primary w-full"
          :disabled="loading"
        >
          <span v-if="loading">Inscription en cours...</span>
          <span v-else>S'inscrire</span>
        </button>
      </form>

      <div class="mt-6 text-center">
        <p class="text-gray-600">
          Déjà un compte ?
          <router-link to="/login" class="text-primary-600 hover:text-primary-700 font-medium">
            Se connecter
          </router-link>
        </p>
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
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: ''
})

const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const handleRegister = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (form.password !== form.confirmPassword) {
    errorMessage.value = 'Les mots de passe ne correspondent pas'
    return
  }

  loading.value = true

  const result = await authStore.register(form.email, form.password, {
    firstName: form.firstName,
    lastName: form.lastName,
    fullName: `${form.firstName} ${form.lastName}`
  })

  if (result.success) {
    if (result.message) {
      successMessage.value = result.message
    } else {
      toastStore.success('Inscription réussie !')
      router.push('/dashboard')
    }
  } else {
    errorMessage.value = result.error
  }

  loading.value = false
}
</script>
