import { defineStore } from 'pinia'
import api from '@/lib/api'
import { useToastStore } from './toast'

export const useSpacesStore = defineStore('spaces', {
  state: () => ({
    spaces: [],
    currentSpace: null,
    pinnedSpaces: [],
    statistics: null,
    loading: false,
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0
    }
  }),

  getters: {
    isPinned: (state) => (spaceId) => {
      return state.pinnedSpaces.some(s => s.id === spaceId)
    }
  },

  actions: {
    async fetchSpaces(search = '', page = 1) {
      this.loading = true
      const toast = useToastStore()
      
      try {
        const params = new URLSearchParams({ 
          page: page.toString(), 
          limit: this.pagination.limit.toString() 
        })
        if (search) params.append('search', search)
        
        const response = await api.get(`/spaces?${params}`)
        this.spaces = response.data.data
        this.pagination = response.data.meta
      } catch (error) {
        console.error('Error fetching spaces:', error)
        toast.error('Erreur lors du chargement des espaces')
        throw error
      } finally {
        this.loading = false
      }
    },

    async fetchSpace(id) {
      this.loading = true
      const toast = useToastStore()
      
      try {
        const response = await api.get(`/spaces/${id}`)
        this.currentSpace = response.data
        return response.data
      } catch (error) {
        console.error('Error fetching space:', error)
        toast.error('Espace non trouvé')
        throw error
      } finally {
        this.loading = false
      }
    },

    async createSpace(data) {
      const toast = useToastStore()
      
      try {
        const response = await api.post('/spaces', data)
        this.spaces.unshift(response.data)
        toast.success('Espace créé avec succès')
        return response.data
      } catch (error) {
        console.error('Error creating space:', error)
        const message = error.response?.data?.message || 'Erreur lors de la création'
        toast.error(Array.isArray(message) ? message.join(', ') : message)
        throw error
      }
    },

    async updateSpace(id, data) {
      const toast = useToastStore()
      
      try {
        const response = await api.patch(`/spaces/${id}`, data)
        const index = this.spaces.findIndex(s => s.id === id)
        if (index !== -1) {
          this.spaces[index] = response.data
        }
        if (this.currentSpace?.id === id) {
          this.currentSpace = response.data
        }
        toast.success('Espace mis à jour')
        return response.data
      } catch (error) {
        console.error('Error updating space:', error)
        toast.error('Erreur lors de la mise à jour')
        throw error
      }
    },

    async deleteSpace(id) {
      const toast = useToastStore()
      
      try {
        await api.delete(`/spaces/${id}`)
        this.spaces = this.spaces.filter(s => s.id !== id)
        toast.success('Espace supprimé')
      } catch (error) {
        console.error('Error deleting space:', error)
        toast.error('Erreur lors de la suppression')
        throw error
      }
    },

    async pinSpace(id) {
      const toast = useToastStore()
      
      try {
        const response = await api.post(`/spaces/${id}/pin`)
        await this.fetchPinned()
        toast.success('Espace épinglé')
        return response.data
      } catch (error) {
        console.error('Error pinning space:', error)
        toast.error('Erreur lors de l\'épinglage')
        throw error
      }
    },

    async unpinSpace(id) {
      const toast = useToastStore()
      
      try {
        await api.delete(`/spaces/${id}/pin`)
        await this.fetchPinned()
        toast.success('Espace désépinglé')
      } catch (error) {
        console.error('Error unpinning space:', error)
        toast.error('Erreur')
        throw error
      }
    },

    async fetchPinned() {
      try {
        const response = await api.get('/spaces/pinned')
        this.pinnedSpaces = response.data
      } catch (error) {
        console.error('Error fetching pinned spaces:', error)
      }
    },

    async grantAccess(spaceId, userId, role) {
      const toast = useToastStore()
      
      try {
        const response = await api.post(`/spaces/${spaceId}/access`, { userId, role })
        toast.success('Accès accordé')
        return response.data
      } catch (error) {
        console.error('Error granting access:', error)
        toast.error('Erreur lors de l\'attribution d\'accès')
        throw error
      }
    },

    async revokeAccess(spaceId, userId) {
      const toast = useToastStore()
      
      try {
        await api.delete(`/spaces/${spaceId}/access/${userId}`)
        toast.success('Accès révoqué')
      } catch (error) {
        console.error('Error revoking access:', error)
        toast.error('Erreur lors de la révocation')
        throw error
      }
    },

    async fetchSpaceUsers(spaceId) {
      try {
        const response = await api.get(`/spaces/${spaceId}/users`)
        return response.data
      } catch (error) {
        console.error('Error fetching space users:', error)
        throw error
      }
    },

    async fetchStatistics() {
      try {
        const response = await api.get('/spaces/statistics')
        this.statistics = response.data
        return response.data
      } catch (error) {
        console.error('Error fetching statistics:', error)
        throw error
      }
    }
  }
})
