<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <h1 class="text-center text-3xl font-extrabold text-gray-900">
        🎉 Bienvenue !
      </h1>
      <p class="mt-2 text-center text-sm text-gray-600">
        Connecté en tant que <span class="font-medium text-primary-600">{{ userEmail }}</span>
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full" :class="mode === 'create' ? 'max-w-2xl' : 'max-w-lg'">
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        
        <!-- Mode Selection -->
        <div v-if="!mode" class="space-y-4">
          <h2 class="text-xl font-semibold text-gray-900 mb-6 text-center">
            Comment souhaitez-vous commencer ?
          </h2>

          <!-- Create Organization -->
          <button
            @click="mode = 'create'"
            class="w-full flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all duration-200"
          >
            <div class="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center mr-4">
              <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
              </svg>
            </div>
            <div class="text-left">
              <h3 class="font-medium text-gray-900">Créer mon organisation</h3>
              <p class="text-sm text-gray-500">Je suis propriétaire et je veux créer ma propre structure</p>
            </div>
          </button>

          <!-- Join with Invitation -->
          <button
            @click="mode = 'join'"
            class="w-full flex items-center p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all duration-200"
          >
            <div class="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mr-4">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
              </svg>
            </div>
            <div class="text-left">
              <h3 class="font-medium text-gray-900">Rejoindre une organisation</h3>
              <p class="text-sm text-gray-500">J'ai un code d'invitation pour rejoindre une équipe</p>
            </div>
          </button>
        </div>

        <!-- Create Organization Form -->
        <div v-else-if="mode === 'create'">
          <button @click="mode = null; currentStep = 1" class="flex items-center text-gray-500 hover:text-gray-700 mb-4">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Retour
          </button>

          <h2 class="text-xl font-semibold text-gray-900 mb-2">
            Créer votre organisation
          </h2>
          
          <!-- Progress Steps -->
          <div class="flex items-center mb-6">
            <div class="flex items-center">
              <div :class="['w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium', currentStep >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600']">1</div>
              <span class="ml-2 text-sm" :class="currentStep >= 1 ? 'text-primary-600 font-medium' : 'text-gray-500'">Informations</span>
            </div>
            <div class="flex-1 mx-4 h-0.5" :class="currentStep >= 2 ? 'bg-primary-600' : 'bg-gray-200'"></div>
            <div class="flex items-center">
              <div :class="['w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium', currentStep >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600']">2</div>
              <span class="ml-2 text-sm" :class="currentStep >= 2 ? 'text-primary-600 font-medium' : 'text-gray-500'">Contact</span>
            </div>
            <div class="flex-1 mx-4 h-0.5" :class="currentStep >= 3 ? 'bg-primary-600' : 'bg-gray-200'"></div>
            <div class="flex items-center">
              <div :class="['w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium', currentStep >= 3 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600']">3</div>
              <span class="ml-2 text-sm" :class="currentStep >= 3 ? 'text-primary-600 font-medium' : 'text-gray-500'">Détails</span>
            </div>
          </div>

          <form @submit.prevent="handleCreateSubmit">
            <!-- Step 1: Basic Info -->
            <div v-show="currentStep === 1" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Votre prénom *</label>
                  <input
                    v-model="createForm.firstName"
                    type="text"
                    required
                    placeholder="Jean"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Votre nom *</label>
                  <input
                    v-model="createForm.lastName"
                    type="text"
                    required
                    placeholder="Dupont"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Nom de l'organisation *</label>
                <input
                  v-model="createForm.organizationName"
                  type="text"
                  required
                  placeholder="Mon Restaurant"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Type d'organisation *</label>
                <select
                  v-model="createForm.organizationType"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sélectionnez...</option>
                  <option value="Restaurant">Restaurant</option>
                  <option value="Hotel">Hôtel</option>
                  <option value="Bar">Bar / Nightclub</option>
                  <option value="Event">Événementiel</option>
                  <option value="Festival">Festival</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
            </div>

            <!-- Step 2: Contact Info -->
            <div v-show="currentStep === 2" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Email de l'organisation *</label>
                <input
                  v-model="createForm.organizationEmail"
                  type="email"
                  required
                  placeholder="contact@monrestaurant.fr"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                <input
                  v-model="createForm.organizationPhone"
                  type="tel"
                  required
                  placeholder="+33 6 12 34 56 78"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                <input
                  v-model="createForm.address"
                  type="text"
                  placeholder="123 Rue de Paris"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
                  <input
                    v-model="createForm.postalCode"
                    type="text"
                    placeholder="75001"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input
                    v-model="createForm.city"
                    type="text"
                    placeholder="Paris"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>

            <!-- Step 3: Additional Details (Optional) -->
            <div v-show="currentStep === 3" class="space-y-4">
              <p class="text-sm text-gray-500 mb-4">Ces informations sont optionnelles et peuvent être complétées plus tard.</p>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Numéro SIRET</label>
                <input
                  v-model="createForm.siret"
                  type="text"
                  placeholder="123 456 789 00012"
                  maxlength="17"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Nombre d'employés</label>
                  <select
                    v-model="createForm.numberOfEmployees"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option :value="null">Non précisé</option>
                    <option :value="1">1 - 5</option>
                    <option :value="10">6 - 20</option>
                    <option :value="50">21 - 50</option>
                    <option :value="100">51 - 100</option>
                    <option :value="200">100+</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Nombre d'établissements</label>
                  <select
                    v-model="createForm.numberOfSpaces"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option :value="null">Non précisé</option>
                    <option :value="1">1</option>
                    <option :value="2">2 - 5</option>
                    <option :value="10">6 - 10</option>
                    <option :value="20">10+</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Mode de paiement préféré</label>
                <select
                  v-model="createForm.paymentMethod"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Non précisé</option>
                  <option value="Card">Carte bancaire</option>
                  <option value="Transfer">Virement bancaire</option>
                  <option value="Direct Debit">Prélèvement automatique</option>
                </select>
              </div>
            </div>

            <!-- Error message -->
            <div v-if="errorMessage" class="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p class="text-red-700 text-sm">{{ errorMessage }}</p>
            </div>

            <!-- Navigation Buttons -->
            <div class="mt-6 flex justify-between">
              <button
                v-if="currentStep > 1"
                type="button"
                @click="currentStep--"
                class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Précédent
              </button>
              <div v-else></div>

              <button
                v-if="currentStep < 3"
                type="button"
                @click="nextStep"
                :disabled="!canProceed"
                class="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
              </button>

              <button
                v-else
                type="submit"
                :disabled="loading"
                class="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <svg v-if="loading" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ loading ? 'Création...' : 'Créer mon organisation' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Join with Invitation Code -->
        <div v-else-if="mode === 'join'">
          <button @click="mode = null" class="flex items-center text-gray-500 hover:text-gray-700 mb-4">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Retour
          </button>

          <h2 class="text-xl font-semibold text-gray-900 mb-6">
            Rejoindre avec un code d'invitation
          </h2>

          <form @submit.prevent="joinWithCode" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Code d'invitation *</label>
              <input
                v-model="joinForm.invitationCode"
                type="text"
                required
                placeholder="ABC12345"
                maxlength="12"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-lg tracking-widest uppercase"
                @input="joinForm.invitationCode = joinForm.invitationCode.toUpperCase()"
              />
              <p class="text-xs text-gray-500 mt-1">Demandez ce code à l'administrateur de votre organisation</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Votre prénom</label>
                <input
                  v-model="joinForm.firstName"
                  type="text"
                  placeholder="Jean"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Votre nom</label>
                <input
                  v-model="joinForm.lastName"
                  type="text"
                  placeholder="Dupont"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <!-- Error message -->
            <div v-if="errorMessage" class="bg-red-50 border border-red-200 rounded-lg p-3">
              <p class="text-red-700 text-sm">{{ errorMessage }}</p>
            </div>

            <button
              type="submit"
              :disabled="loading || !joinForm.invitationCode || joinForm.invitationCode.length < 6"
              class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="loading" class="flex items-center">
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Vérification...
              </span>
              <span v-else>Rejoindre l'organisation</span>
            </button>
          </form>
        </div>

        <!-- Success Modal -->
        <div v-if="successData" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center">
            <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-2">
              {{ successData.isCreate ? 'Organisation créée !' : 'Bienvenue !' }}
            </h3>
            <p class="text-gray-600 mb-4">
              Vous avez rejoint <strong>{{ successData.tenant?.name }}</strong>
            </p>
            
            <div v-if="successData.invitationCode" class="bg-gray-50 rounded-lg p-4 mb-4">
              <p class="text-sm text-gray-500 mb-2">Code d'invitation pour votre équipe :</p>
              <p class="text-2xl font-mono font-bold text-primary-600 tracking-wider">
                {{ successData.invitationCode }}
              </p>
              <button 
                @click="copyInvitationCode"
                class="mt-2 text-sm text-primary-600 hover:text-primary-700"
              >
                📋 Copier le code
              </button>
            </div>

            <button
              @click="goToDashboard"
              class="w-full py-3 px-4 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Accéder au Dashboard
            </button>
          </div>
        </div>

        <!-- Logout option -->
        <div class="mt-6 pt-6 border-t border-gray-200">
          <button
            @click="logout"
            class="w-full text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Se déconnecter et utiliser un autre compte
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import api from '@/lib/api'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToastStore()

const mode = ref(null) // null, 'create', 'join'
const currentStep = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const successData = ref(null)

// Create organization form
const createForm = ref({
  firstName: '',
  lastName: '',
  organizationName: '',
  organizationType: '',
  organizationEmail: '',
  organizationPhone: '',
  address: '',
  city: '',
  postalCode: '',
  country: 'France',
  siret: '',
  numberOfEmployees: null,
  numberOfSpaces: null,
  paymentMethod: ''
})

// Join with invitation form
const joinForm = ref({
  invitationCode: '',
  firstName: '',
  lastName: ''
})

const userEmail = computed(() => authStore.user?.email || 'Utilisateur')

// Validation for step navigation
const canProceed = computed(() => {
  if (currentStep.value === 1) {
    return createForm.value.firstName && 
           createForm.value.lastName && 
           createForm.value.organizationName && 
           createForm.value.organizationType
  }
  if (currentStep.value === 2) {
    return createForm.value.organizationEmail && 
           createForm.value.organizationPhone
  }
  return true
})

onMounted(() => {
  // Pre-fill email from Supabase user
  if (authStore.user?.email) {
    createForm.value.organizationEmail = authStore.user.email
  }
  
  // If user already has a tenant, redirect to dashboard
  if (authStore.hasDbUser && !authStore.needsOnboarding) {
    router.push('/dashboard')
  }
})

function nextStep() {
  if (canProceed.value && currentStep.value < 3) {
    currentStep.value++
    errorMessage.value = ''
  }
}

async function handleCreateSubmit() {
  await createOrganization()
}

async function createOrganization() {
  loading.value = true
  errorMessage.value = ''
  
  try {
    // Clean up the data
    const payload = {
      firstName: createForm.value.firstName,
      lastName: createForm.value.lastName,
      organizationName: createForm.value.organizationName,
      organizationType: createForm.value.organizationType,
      organizationEmail: createForm.value.organizationEmail,
      organizationPhone: createForm.value.organizationPhone,
    }

    // Add optional fields only if they have values
    if (createForm.value.address) payload.address = createForm.value.address
    if (createForm.value.city) payload.city = createForm.value.city
    if (createForm.value.postalCode) payload.postalCode = createForm.value.postalCode
    if (createForm.value.country) payload.country = createForm.value.country
    if (createForm.value.siret) payload.siret = createForm.value.siret.replace(/\s/g, '')
    if (createForm.value.numberOfEmployees) payload.numberOfEmployees = createForm.value.numberOfEmployees
    if (createForm.value.numberOfSpaces) payload.numberOfSpaces = createForm.value.numberOfSpaces
    if (createForm.value.paymentMethod) payload.paymentMethod = createForm.value.paymentMethod

    const response = await api.post('/onboarding', payload)
    
    if (response.data) {
      await authStore.checkDbUser()
      successData.value = {
        isCreate: true,
        tenant: response.data.tenant,
        invitationCode: response.data.tenant?.invitationCode
      }
    }
  } catch (e) {
    console.error('Create organization error:', e)
    const message = e.response?.data?.message
    if (Array.isArray(message)) {
      errorMessage.value = message.join('\n')
    } else {
      errorMessage.value = message || 'Erreur lors de la création'
    }
  } finally {
    loading.value = false
  }
}

async function joinWithCode() {
  loading.value = true
  errorMessage.value = ''
  
  try {
    const response = await api.post('/onboarding/join-by-code', {
      invitationCode: joinForm.value.invitationCode.toUpperCase().trim(),
      firstName: joinForm.value.firstName || undefined,
      lastName: joinForm.value.lastName || undefined
    })
    
    if (response.data) {
      await authStore.checkDbUser()
      successData.value = {
        isCreate: false,
        tenant: response.data.tenant,
        invitationCode: null
      }
    }
  } catch (e) {
    console.error('Join error:', e)
    const status = e.response?.status
    if (status === 404) {
      errorMessage.value = 'Code d\'invitation invalide ou expiré'
    } else if (status === 409) {
      errorMessage.value = 'Vous êtes déjà membre d\'une organisation'
    } else if (status === 400) {
      errorMessage.value = e.response?.data?.message || 'Code invalide'
    } else {
      errorMessage.value = 'Une erreur est survenue. Veuillez réessayer.'
    }
  } finally {
    loading.value = false
  }
}

function copyInvitationCode() {
  if (successData.value?.invitationCode) {
    navigator.clipboard.writeText(successData.value.invitationCode)
    toast.success('Code copié dans le presse-papier !')
  }
}

function goToDashboard() {
  successData.value = null
  router.push('/dashboard')
}

async function logout() {
  await authStore.logout()
  router.push('/login')
}
</script>
