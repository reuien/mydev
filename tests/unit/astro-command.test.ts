import { describe, expect, it } from 'vitest';

import { resolveAstroCommand } from '../../src/config/astro-command';

describe('resolveAstroCommand', () => {
  it.each(['dev', 'check', 'build', 'preview'])('isolates the %s command cache', (command) => {
    expect(resolveAstroCommand(['/usr/bin/node', '/project/astro.mjs', command, '--json'])).toBe(command);
  });

  it('uses a stable fallback outside an Astro command', () => {
    expect(resolveAstroCommand(['/usr/bin/node', '/project/vitest.mjs'])).toBe('default');
  });
});
