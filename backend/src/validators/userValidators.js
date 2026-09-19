import { z } from 'zod';

/**
 * Profile fields a client may set/update. uid/email/createdAt are server-controlled
 * and never accepted from the body.
 */
export const upsertProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  photoURL: z.string().url().max(2048).optional(),
  occupation: z.string().trim().max(120).optional(),
  // IANA timezone id, e.g. "Asia/Kolkata". Full validity is re-checked in code.
  timezone: z.string().trim().min(1).max(64).optional(),
});

/**
 * A conservative subset of settings for Phase 1. Extended in later phases.
 */
export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  scoreWeights: z.record(z.string(), z.number().min(0).max(1)).optional(),
});
