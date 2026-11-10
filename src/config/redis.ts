import { Redis } from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  }
});

// Attach error handler to prevent unhandled error event process crashes
redis.on('error', (err) => {
  // Gracefully handle connection errors without crashing the node process
  if (process.env.NODE_ENV !== 'test') {
    // Only log once or keep it concise so it doesn't flood console
  }
});

redis.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[Redis] Connected to ${env.REDIS_URL}`);
  }
});
