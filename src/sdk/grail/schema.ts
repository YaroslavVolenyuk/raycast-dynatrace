// Grail query-execution response envelope. The per-resource record schemas
// (logs, problems, spans, …) live in src/sdk/resources and are layered on top.

import { z } from "zod";

// result.metadata.grail.notifications: warnings Grail attaches to a finished
// query (result truncated, scan limit reached, sampling applied, …). The exact
// notificationType codes are not documented as a closed set, so every field is
// optional and unknown codes pass through; callers show `message` verbatim.
export const grailNotificationSchema = z
  .object({
    severity: z.string().optional(),
    notificationType: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export type GrailNotification = z.infer<typeof grailNotificationSchema>;

const grailMetadataSchema = z
  .object({
    grail: z
      .object({ notifications: z.array(grailNotificationSchema).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const grailResponseSchema = z.object({
  // Known values typed; unknown future values accepted as plain string
  state: z.enum(["SUCCEEDED", "RUNNING", "FAILED"]).or(z.string()),
  progress: z.number().optional(),
  result: z
    .object({
      records: z.array(z.record(z.string(), z.unknown())), // the only field code actually uses
      types: z.array(z.unknown()).optional(), // not consumed — keep loose
      // Only notifications are read; a metadata shape we don't expect is ignored, never fatal.
      metadata: grailMetadataSchema.optional().catch(undefined),
    })
    .optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
  requestToken: z.string().optional(),
});
