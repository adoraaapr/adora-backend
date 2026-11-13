import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distServer = path.resolve(__dirname, '..', 'dist', 'server.js');
try {
  fs.writeFileSync(distServer, "import './src/server.js';\n");
  console.log('[Postbuild] Created dist/server.js wrapper pointing to dist/src/server.js');
} catch (e) {
  console.warn('[Postbuild] Could not create dist/server.js:', e);
}
