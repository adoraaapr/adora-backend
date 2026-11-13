import {Queue} from 'bullmq';
import {redis} from '../config/redis.js';

export const maintenanceQueue = new Queue('adora-maintenance', {connection: redis});
maintenanceQueue.on('error', (err) => {
  console.warn('[BullMQ] Queue connection notice:', err?.message || err);
});

export async function scheduleMaintenance() {
  try {
    await maintenanceQueue.upsertJobScheduler(
      'complete-ended-ads',
      {pattern: '*/15 * * * *'},
      {name: 'complete-ended-ads', data: {}}
    );
    await maintenanceQueue.upsertJobScheduler(
      'cleanup-locations',
      {pattern: '30 3 * * *'},
      {name: 'cleanup-locations', data: {}}
    );
    await maintenanceQueue.upsertJobScheduler(
      'retry-webhooks',
      {pattern: '*/5 * * * *'},
      {name: 'retry-webhooks', data: {}}
    );
  } catch (err) {
    console.warn('[BullMQ] Failed to upsert job schedulers (Redis might still be connecting):', err);
  }
}
