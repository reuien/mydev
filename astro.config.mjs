import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  vite: {
    optimizeDeps: {
      exclude: ['@astrojs/cloudflare/entrypoints/server', 'rehype-sanitize'],
    },
  },
});
