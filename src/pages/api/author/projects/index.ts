import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createAuthorProject } from '../../../../http/author-handlers';
import { createAuthorContext } from '../../../../http/context';

export const POST: APIRoute = ({ request }) => createAuthorProject(request, createAuthorContext(env, request));
