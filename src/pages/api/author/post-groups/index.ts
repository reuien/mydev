import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createAuthorPostGroup, listAuthorPostGroups } from '../../../../http/author-handlers';
import { createAuthorContext } from '../../../../http/context';

export const GET: APIRoute = ({ request }) => listAuthorPostGroups(request, createAuthorContext(env, request));
export const POST: APIRoute = ({ request }) => createAuthorPostGroup(request, createAuthorContext(env, request));
