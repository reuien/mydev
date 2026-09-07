import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createServicesFromEnvironment } from '../../../../http/context';
import { handlePublicPostDetail } from '../../../../http/public-handlers';

export const GET: APIRoute = ({ params, request }) =>
  handlePublicPostDetail(request, createServicesFromEnvironment(env).posts, params.slug ?? '');
