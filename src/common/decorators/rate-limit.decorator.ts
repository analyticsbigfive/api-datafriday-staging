import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  points: number; // Nombre de requêtes autorisées
  duration: number; // Période en secondes
  blockDuration?: number; // Durée du blocage en secondes (optionnel)
}

/**
 * Decorator pour définir les limites de rate limiting par endpoint
 * 
 * @example
 * // 10 requêtes par minute
 * @RateLimit({ points: 10, duration: 60 })
 * 
 * // 100 requêtes par heure avec blocage de 15min
 * @RateLimit({ points: 100, duration: 3600, blockDuration: 900 })
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Presets communs
 */
export const RateLimitPresets = {
  // Authentification (strict)
  AUTH: { points: 5, duration: 60, blockDuration: 300 }, // 5/min, block 5min
  
  // Endpoints publics
  PUBLIC: { points: 30, duration: 60 }, // 30/min
  
  // Endpoints standards (authentifiés)
  STANDARD: { points: 100, duration: 60 }, // 100/min
  
  // Endpoints lourds (rapports, analytics)
  HEAVY: { points: 10, duration: 60 }, // 10/min
  
  // API externe / webhooks
  WEBHOOK: { points: 1000, duration: 60 }, // 1000/min
};

/**
 * Shortcuts pour presets
 */
export const PublicRateLimit = () => RateLimit(RateLimitPresets.PUBLIC);
export const AuthRateLimit = () => RateLimit(RateLimitPresets.AUTH);
export const StandardRateLimit = () => RateLimit(RateLimitPresets.STANDARD);
export const HeavyRateLimit = () => RateLimit(RateLimitPresets.HEAVY);
