import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createServicesFromEnvironment } from '../../../../http/context';
import { handlePublicProjectDetail } from '../../../../http/public-handlers';

export const GET: APIRoute = ({ params, request }) =>
  handlePublicProjectDetail(request, createServicesFromEnvironment(env).projects, params.slug ?? '');
