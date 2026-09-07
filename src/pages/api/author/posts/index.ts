import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createAuthorPost } from '../../../../http/author-handlers';
import { createAuthorContext } from '../../../../http/context';

export const POST: APIRoute = ({ request }) => createAuthorPost(request, createAuthorContext(env, request));
