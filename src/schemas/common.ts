import { z } from 'zod';

export const MAX_MARKDOWN_BYTES = 1024 * 1024;

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const markdownSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, { message: 'Markdown content cannot be blank' })
  .refine((value) => new TextEncoder().encode(value).byteLength <= MAX_MARKDOWN_BYTES, {
    message: 'Markdown content exceeds 1 MiB',
  });

const absoluteHttpUrlSchema = z.string().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'URL must be absolute and use http or https');

const assetPathSchema = z.string().regex(/^\/assets\/.+/);

export const externalUrlSchema = absoluteHttpUrlSchema;
export const coverImageUrlSchema = z.union([assetPathSchema, absoluteHttpUrlSchema]);

const emptyToNull = (value: unknown) => (value === '' ? null : value);

export const nullableExternalUrlSchema = z.preprocess(emptyToNull, externalUrlSchema.nullable());
export const nullableCoverImageUrlSchema = z.preprocess(emptyToNull, coverImageUrlSchema.nullable());
