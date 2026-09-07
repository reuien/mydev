import { describe, expect, it } from 'vitest';

import { APP_NAME } from '../../src/config/app';

describe('application configuration', () => {
  it('has the public application name', () => {
    expect(APP_NAME).toBe('MyDev');
  });
});
