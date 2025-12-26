// API Configuration
// Uses environment variables from .env file

export const config = {
  // API URL - loaded from .env
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',
  
  // Supabase configuration - loaded from .env
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  },
  
  // App settings
  appName: 'DataFriday',
  version: '1.0.0'
}

// Debug: log config in development
if (import.meta.env.DEV) {
  console.log('🔧 Config loaded:', {
    apiUrl: config.apiUrl,
    supabaseUrl: config.supabase.url ? '✅ Set' : '❌ Missing',
    supabaseKey: config.supabase.anonKey ? '✅ Set' : '❌ Missing'
  })
}

export default config
