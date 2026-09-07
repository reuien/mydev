import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { getAuthorPostBySlug } from '../../../../../http/author-handlers';
import { createAuthorContext } from '../../../../../http/context';

export const GET: APIRoute = ({ params, request }) =>
  getAuthorPostBySlug(request, createAuthorContext(env, request), params.slug ?? '');
