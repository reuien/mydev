import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { deleteAuthorPost, updateAuthorPost } from '../../../../http/author-handlers';
import { createAuthorContext } from '../../../../http/context';

export const PUT: APIRoute = ({ params, request }) =>
  updateAuthorPost(request, createAuthorContext(env, request), params.id ?? '');

export const DELETE: APIRoute = ({ params, request }) =>
  deleteAuthorPost(request, createAuthorContext(env, request), params.id ?? '');
