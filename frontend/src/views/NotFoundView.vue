<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4">
    <div class="card max-w-md w-full text-center">
      <div class="text-6xl mb-4">🔍</div>
      <h1 class="text-3xl font-bold text-gray-900 mb-2">Page non trouvée</h1>
      <p class="text-gray-500 mb-6">
        La page que vous recherchez n'existe pas ou a été déplacée.
      </p>
      <router-link to="/" class="btn btn-primary">
        ← Retour à l'accueil
      </router-link>
    </div>
  </div>
</template>
