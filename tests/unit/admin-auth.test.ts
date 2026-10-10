import { describe, expect, it } from 'vitest';
import { adminRequestIsSameOrigin, authenticateAdmin, isAdminPath } from '../../src/middleware/admin-auth';

describe('admin access boundary', () => {
  it('covers the entire admin subtree, not similarly named public paths', () => {
    for (const path of ['/admin', '/admin/', '/admin/api/posts']) expect(isAdminPath(path)).toBe(true);
    for (const path of ['/', '/administrator', '/blog/admin']) expect(isAdminPath(path)).toBe(false);
  });
  it('denies missing configuration, anonymous requests and forged identity headers', async () => {
    const request = new Request('https://example.com/admin', { headers: { 'Cf-Access-Authenticated-User-Email': 'owner@example.com' } });
    await expect(authenticateAdmin(request, {})).resolves.toBeNull();
    await expect(authenticateAdmin(request, { ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAIL: 'owner@example.com' })).resolves.toBeNull();
    await expect(authenticateAdmin(request, { ACCESS_TEAM_DOMAIN: 'attacker.example.com', ACCESS_AUD: 'aud', ADMIN_EMAIL: 'owner@example.com' })).resolves.toBeNull();
  });
  it('rejects cross-origin and missing-origin mutations', () => {
    expect(adminRequestIsSameOrigin(new Request('https://example.com/admin'))).toBe(true);
    for (const origin of [undefined, 'https://attacker.example.com']) {
      expect(adminRequestIsSameOrigin(new Request('https://example.com/admin', { method: 'POST', headers: origin ? { Origin: origin } : {} }))).toBe(false);
    }
    expect(adminRequestIsSameOrigin(new Request('https://example.com/admin', { method: 'POST', headers: { Origin: 'https://example.com' } }))).toBe(true);
  });
});
