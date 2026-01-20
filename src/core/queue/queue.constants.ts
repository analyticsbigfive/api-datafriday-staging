// Queue name constants - separate file to avoid circular dependencies

export const QUEUES = {
  DATA_SYNC: 'data-sync',
  ANALYTICS: 'analytics',
  NOTIFICATIONS: 'notifications',
  EXPORTS: 'exports',
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];
