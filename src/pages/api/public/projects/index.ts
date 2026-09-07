import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { createServicesFromEnvironment } from '../../../../http/context';
import { handlePublicProjectList } from '../../../../http/public-handlers';

export const GET: APIRoute = ({ request }) =>
  handlePublicProjectList(request, createServicesFromEnvironment(env).projects);
