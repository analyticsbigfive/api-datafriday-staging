import { createClient } from '@supabase/supabase-js'
import { config } from '@/config'

// Create Supabase client with persistence configuration
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      // Use localStorage for session persistence
      storage: window.localStorage,
      storageKey: 'datafriday-auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
)

export default supabase
