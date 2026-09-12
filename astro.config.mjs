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
    // Keep interaction scripts as same-origin files so the site's CSP can load
    // them in production too; Astro otherwise inlines small script bundles.
    build: {
      assetsInlineLimit: 0,
    },
    // Astro's commands can run concurrently while the background dev server is
    // active. Separate their optimizer caches so check/build cannot invalidate
    // versioned SSR modules that the running Cloudflare worker still references.
    cacheDir: `node_modules/.vite/${astroCommand}`,
    optimizeDeps: {
      exclude: ['rehype-sanitize'],
    },
  },
});
