import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { getAuthorProjectBySlug } from '../../../../../http/author-handlers';
import { createAuthorContext } from '../../../../../http/context';

export const GET: APIRoute = ({ params, request }) =>
  getAuthorProjectBySlug(request, createAuthorContext(env, request), params.slug ?? '');
