import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createServicesFromEnvironment } from '../../../../http/context';
import { handlePublicPostGroupList } from '../../../../http/public-handlers';

export const GET: APIRoute = ({ request }) =>
  handlePublicPostGroupList(request, createServicesFromEnvironment(env).postGroups);
