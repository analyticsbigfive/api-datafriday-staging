/**
 * Application configuration
 * Centralized configuration for the DataFriday API
 */

export const AppConfig = {
  // API Configuration
  api: {
    prefix: 'api/v1',
    version: '1.0.0',
  },

  // Pagination defaults
  pagination: {
    defaultPage: 1,
    defaultLimit: 20,
    maxLimit: 100,
  },

  // Cache configuration
  cache: {
    defaultTtl: 300, // 5 minutes in seconds
    maxSize: 1000,
  },

  // JWT configuration
  jwt: {
    expiresIn: '7d',
  },

  // Weezevent integration
  weezevent: {
    authUrl: 'https://accounts.weezevent.com/realms/accounts/protocol/openid-connect/token',
    apiUrl: 'https://api.weezevent.com',
    timeout: 10000,
  },
} as const;

export type AppConfigType = typeof AppConfig;
