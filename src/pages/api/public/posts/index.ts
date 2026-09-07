import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createServicesFromEnvironment } from '../../../../http/context';
import { handlePublicPostList } from '../../../../http/public-handlers';

export const GET: APIRoute = ({ request }) =>
  handlePublicPostList(request, createServicesFromEnvironment(env).posts);
