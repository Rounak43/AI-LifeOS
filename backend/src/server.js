import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`AI LifeOS API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  if (!env.firebase.projectId) {
    console.warn(
      '⚠  Firebase Admin is not configured — auth-protected routes will return 401. ' +
        'Copy .env.example to .env and fill in the service-account values.'
    );
  }
});

// Graceful shutdown.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down.`);
    server.close(() => process.exit(0));
  });
}
