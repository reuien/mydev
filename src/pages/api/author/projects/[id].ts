import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { deleteAuthorProject, updateAuthorProject } from '../../../../http/author-handlers';
import { createAuthorContext } from '../../../../http/context';

export const PUT: APIRoute = ({ params, request }) =>
  updateAuthorProject(request, createAuthorContext(env, request), params.id ?? '');

export const DELETE: APIRoute = ({ params, request }) =>
  deleteAuthorProject(request, createAuthorContext(env, request), params.id ?? '');
