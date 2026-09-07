import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { transitionAuthorPost } from '../../../../../http/author-handlers';
import { createAuthorContext } from '../../../../../http/context';

export const POST: APIRoute = ({ params, request }) =>
  transitionAuthorPost(request, createAuthorContext(env, request), params.id ?? '', 'published');
