// Grail query-execution response envelope. The per-resource record schemas
// (logs, problems, spans, …) live in src/sdk/resources and are layered on top.

import { z } from "zod";

export const grailResponseSchema = z.object({
  // Known values typed; unknown future values accepted as plain string
  state: z.enum(["SUCCEEDED", "RUNNING", "FAILED"]).or(z.string()),
  progress: z.number().optional(),
  result: z
    .object({
      records: z.array(z.record(z.string(), z.unknown())), // the only field code actually uses
      types: z.array(z.unknown()).optional(), // not consumed — keep loose
      metadata: z.unknown().optional(), // not consumed — keep loose
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

export type GrailResponse = z.infer<typeof grailResponseSchema>;
