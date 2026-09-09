import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

import { resolveAstroCommand } from './src/config/astro-command';

const astroCommand = resolveAstroCommand(process.argv);

export default defineConfig({
  adapter: cloudflare({
    // This project does not use runtime image transforms.
    imageService: 'passthrough',
  }),
  // Avoid provisioning a KV namespace when no page uses Astro sessions.
  session: false,
  output: 'server',
  vite: {
    // Astro's commands can run concurrently while the background dev server is
    // active. Separate their optimizer caches so check/build cannot invalidate
    // versioned SSR modules that the running Cloudflare worker still references.
    cacheDir: `node_modules/.vite/${astroCommand}`,
    optimizeDeps: {
      exclude: ['rehype-sanitize'],
    },
  },
});
