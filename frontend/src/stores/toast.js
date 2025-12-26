import { defineStore } from 'pinia'
import { ref } from 'vue'

let toastId = 0

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  function addToast(message, type = 'info', duration = 3000) {
    const id = ++toastId
    
    toasts.value.push({
      id,
      message,
      type
    })

    // Auto remove after duration
    setTimeout(() => {
      removeToast(id)
    }, duration)

    return id
  }

  function removeToast(id) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  function success(message, duration) {
    return addToast(message, 'success', duration)
  }

  function error(message, duration) {
    return addToast(message, 'error', duration)
  }

  function warning(message, duration) {
    return addToast(message, 'warning', duration)
  }

  function info(message, duration) {
    return addToast(message, 'info', duration)
  }

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info
  }
})
