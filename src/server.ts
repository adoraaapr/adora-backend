import {app,logger} from './app.js';
import {env} from './config/env.js';
import {prisma} from './config/db.js';
import {redis} from './config/redis.js';

const server = app.listen(env.PORT, () => logger.info({port: env.PORT}, 'Adora API listening'));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({signal}, 'Graceful shutdown started');

  server.close(async () => {
    try {
      await prisma.$disconnect().catch(() => {});
      try {
        if (redis.status === 'ready' || redis.status === 'connecting') {
          await Promise.race([redis.quit(), new Promise(r => setTimeout(r, 1500))]);
        } else {
          redis.disconnect();
        }
      } catch {}
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (e) {
      logger.error({err: e}, 'Shutdown error');
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Shutdown timed out');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', reason => {
  logger.fatal({reason}, 'Unhandled rejection');
  void shutdown('unhandledRejection');
});
