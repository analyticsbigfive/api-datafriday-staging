import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import api from '@/lib/api'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref(null)
  const token = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const initialized = ref(false)
  const dbUser = ref(null) // User from database
  const needsOnboarding = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const hasDbUser = computed(() => !!dbUser.value)

  // Actions
  async function checkDbUser() {
    try {
      const response = await api.get('/onboarding/status')
      if (response.data.exists) {
        dbUser.value = response.data.user
        needsOnboarding.value = false
      } else {
        dbUser.value = null
        needsOnboarding.value = true
      }
      return response.data
    } catch (e) {
      console.warn('Could not check DB user status:', e.message)
      needsOnboarding.value = true
      return null
    }
  }

  async function checkAuth() {
    try {
      loading.value = true
      
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        token.value = session.access_token
        user.value = session.user
        
        // Check if user exists in DB
        await checkDbUser()
      }
    } catch (e) {
      console.error('Auth check error:', e)
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  async function login(email, password) {
    try {
      loading.value = true
      error.value = null

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (authError) throw authError

      token.value = data.session.access_token
      user.value = data.user

      // Check if user exists in DB
      await checkDbUser()

      return { success: true, needsOnboarding: needsOnboarding.value }
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  async function register(email, password, metadata = {}) {
    try {
      loading.value = true
      error.value = null

      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      })

      if (authError) throw authError

      // If email confirmation is required
      if (!data.session) {
        return { 
          success: true, 
          message: 'Vérifiez votre email pour confirmer votre inscription' 
        }
      }

      token.value = data.session.access_token
      user.value = data.user

      return { success: true }
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  async function joinTenant(slug) {
    try {
      loading.value = true
      error.value = null

      const response = await api.post(`/onboarding/join/${slug}`)
      
      if (response.data) {
        dbUser.value = response.data.user
        needsOnboarding.value = false
        return { success: true, user: response.data.user }
      }
      
      return { success: false, error: 'Réponse invalide' }
    } catch (e) {
      const message = e.response?.data?.message || e.message
      error.value = message
      return { success: false, error: message }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.error('Logout error:', e)
    } finally {
      token.value = null
      user.value = null
      dbUser.value = null
      needsOnboarding.value = false
    }
  }

  // Listen for auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      token.value = session.access_token
      user.value = session.user
    } else {
      token.value = null
      user.value = null
      dbUser.value = null
      needsOnboarding.value = false
    }
  })

  return {
    // State
    user,
    token,
    loading,
    error,
    initialized,
    dbUser,
    needsOnboarding,
    // Getters
    isAuthenticated,
    hasDbUser,
    // Actions
    checkAuth,
    checkDbUser,
    login,
    register,
    joinTenant,
    logout
  }
})
