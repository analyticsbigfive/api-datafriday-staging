import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/onboarding',
    name: 'Onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { requiresAuth: true, allowOnboarding: true }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/tenants',
    name: 'Tenants',
    component: () => import('@/views/TenantsView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/spaces',
    name: 'Spaces',
    component: () => import('@/views/SpacesView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/spaces/:id',
    name: 'SpaceDetail',
    component: () => import('@/views/SpaceDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/weezevent',
    name: 'Weezevent',
    component: () => import('@/views/WeezeventView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/api-test',
    name: 'ApiTest',
    component: () => import('@/views/ApiTestView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guards
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // Wait for auth check to complete
  if (!authStore.initialized) {
    await authStore.checkAuth()
  }

  const isAuthenticated = authStore.isAuthenticated
  const needsOnboarding = authStore.needsOnboarding
  const userRole = authStore.dbUser?.role || null

  if (to.meta.requiresAuth && !isAuthenticated) {
    // Not authenticated, redirect to login
    next('/login')
  } else if (to.meta.requiresGuest && isAuthenticated) {
    // Already authenticated, redirect to dashboard or onboarding
    next(needsOnboarding ? '/onboarding' : '/dashboard')
  } else if (isAuthenticated && needsOnboarding && to.meta.requiresAuth && !to.meta.allowOnboarding) {
    // Authenticated but needs onboarding, redirect to onboarding
    next('/onboarding')
  } else if (to.meta.requiresAdmin && userRole !== 'ADMIN') {
    // Requires ADMIN role but user doesn't have it
    next('/dashboard')
  } else {
    next()
  }
})

export default router
