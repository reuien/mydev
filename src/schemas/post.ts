import { z } from 'zod';

import { markdownSchema, nullableCoverImageUrlSchema, slugSchema } from './common';

const editablePostShape = {
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().min(1).max(320),
  bodyMarkdown: markdownSchema,
  coverImageUrl: nullableCoverImageUrlSchema,
  groupId: z.uuid().nullable().optional().default(null),
};

export const createPostSchema = z
  .strictObject({
    slug: slugSchema,
    ...editablePostShape,
    coverImageUrl: nullableCoverImageUrlSchema.optional().default(null),
    groupId: z.uuid().nullable().optional().default(null),
  });

export const updatePostSchema = z.strictObject(editablePostShape);

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
