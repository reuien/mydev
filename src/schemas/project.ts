import { z } from 'zod';

import {
  markdownSchema,
  nullableCoverImageUrlSchema,
  nullableExternalUrlSchema,
  slugSchema,
} from './common';

const techStackSchema = z
  .array(z.string().trim().min(1).max(40))
  .min(1)
  .max(20)
  .superRefine((items, context) => {
    if (new Set(items).size !== items.length) {
      context.addIssue({ code: 'custom', message: 'Technology names must be unique' });
    }
  });

const sortOrderSchema = z.number().int().min(-2_147_483_648).max(2_147_483_647);

const editableProjectShape = {
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(240),
  bodyMarkdown: markdownSchema,
  techStack: techStackSchema,
  codeUrl: nullableExternalUrlSchema,
  demoUrl: nullableExternalUrlSchema,
  coverImageUrl: nullableCoverImageUrlSchema,
  sortOrder: sortOrderSchema,
};

export const createProjectSchema = z.strictObject({
  slug: slugSchema,
  ...editableProjectShape,
  codeUrl: nullableExternalUrlSchema.optional().default(null),
  demoUrl: nullableExternalUrlSchema.optional().default(null),
  coverImageUrl: nullableCoverImageUrlSchema.optional().default(null),
  sortOrder: sortOrderSchema.optional().default(0),
});

export const updateProjectSchema = z.strictObject(editableProjectShape);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
