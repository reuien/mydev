import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AdminAccessConfig {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/');
}

/** Fail closed, including when Access is not configured or its keys are unavailable. */
export async function authenticateAdmin(request: Request, config: AdminAccessConfig): Promise<string | null> {
  const domain = config.ACCESS_TEAM_DOMAIN;
  if (!domain || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !config.ACCESS_AUD || !config.ADMIN_EMAIL) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return null;
  try {
    let keys = keySets.get(domain);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
      keySets.set(domain, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: `https://${domain}`, audience: config.ACCESS_AUD, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    return typeof payload.email === 'string' && payload.email.toLowerCase() === config.ADMIN_EMAIL.toLowerCase()
      ? payload.email : null;
  } catch {
    return null;
  }
}

export function adminRequestIsSameOrigin(request: Request): boolean {
  return ['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.headers.get('Origin') === new URL(request.url).origin;
}
