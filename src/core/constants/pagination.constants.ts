/**
 * P0: Pagination constants to prevent DoS attacks
 */
export const PAGINATION_LIMITS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 1000,
  DEFAULT_PAGE: 1,
} as const;

/**
 * Sanitize pagination parameters
 */
export function sanitizePagination(page?: number, limit?: number) {
  const safePage = Math.max(page || PAGINATION_LIMITS.DEFAULT_PAGE, 1);
  const safeLimit = Math.min(
    Math.max(limit || PAGINATION_LIMITS.DEFAULT_LIMIT, 1),
    PAGINATION_LIMITS.MAX_LIMIT,
  );
  
  return { page: safePage, limit: safeLimit };
}
