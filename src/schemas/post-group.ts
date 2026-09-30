import { z } from 'zod';

import { slugSchema } from './common';

export const createPostGroupSchema = z.strictObject({
  slug: slugSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().default(''),
});

export type CreatePostGroupInput = z.infer<typeof createPostGroupSchema>;
