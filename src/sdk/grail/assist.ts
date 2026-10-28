// DQL editing assistance: query:verify (syntax check) and query:autocomplete.
// Neither executes the query, so neither consumes query budget. Any storage:*:read
// scope is enough (storage:buckets:read is always configured).
//
// provenance: live tenant responses 2026-10-26 (fixture: sdk/grail/__fixtures__/assist.json).
// Deviations from the published API reference, confirmed live:
//   - syntaxPosition line/column are 1-based, index is 0-based, end.index is inclusive
//   - autocomplete returns placeholder entries with an empty suggestion
//     (PARAMETER_KEY, SYNOPSIS_INFO, a "some custom field" FIELD_NAME)
//   - suggestion parts carry undocumented dataType / category / priority / reference

import { z } from "zod";
import { invalidateTokenCache, type TenantConfig } from "../auth";
import { acquireAccessToken, parseErrorBody } from "./http";
import { environmentNetworkError, isNetworkError } from "./network";

const TIMEOUT_MS = 10_000;

// ── Raw schemas ───────────────────────────────────────────────────────────────

const positionSchema = z.object({ line: z.number(), column: z.number(), index: z.number() });

const verifyResponseSchema = z.object({
  valid: z.boolean(),
  canonicalQuery: z.string().optional(),
  notifications: z
    .array(
      z
        .object({
          severity: z.string().optional(),
          notificationType: z.string().optional(),
          message: z.string(),
          syntaxPosition: z.object({ start: positionSchema, end: positionSchema }).optional(),
        })
        .catchall(z.unknown()),
    )
    .optional(),
});

const suggestionPartSchema = z
  .object({
    type: z.string(),
    suggestion: z.string().optional(),
    info: z.string().optional(),
    synopsis: z.string().optional(),
    dataType: z.string().optional(),
  })
  .catchall(z.unknown());

const autocompleteResponseSchema = z.object({
  optional: z.boolean().optional(),
  suggestedTtlSeconds: z.number().optional(),
  suggestions: z.array(
    z.object({
      suggestion: z.string(),
      alreadyTypedCharacters: z.number(),
      parts: z.array(suggestionPartSchema),
    }),
  ),
});

// ── Domain models ─────────────────────────────────────────────────────────────

export interface DqlIssue {
  severity: "ERROR" | "WARN" | "INFO";
  message: string;
  /** 1-based, as returned by Grail. */
  line?: number;
  /** 1-based, as returned by Grail. */
  column?: number;
}

export interface DqlVerification {
  valid: boolean;
  issues: DqlIssue[];
}

export interface DqlSuggestion {
  /** Text to insert in place of the last `replaceChars` characters before the cursor. */
  text: string;
  replaceChars: number;
  /** Token type of the main part: COMMAND_NAME, FUNCTION_NAME, FIELD_NAME, OPERATOR, … */
  kind: string;
  /** The main part without trailing space or parenthesis, for display. */
  label: string;
  info?: string;
  synopsis?: string;
  /** Field data type (string, number, timestamp, …), for FIELD_NAME suggestions. */
  dataType?: string;
}

export interface DqlCompletion {
  /** Help for the command the cursor is in, e.g. "filter condition". */
  context?: { synopsis?: string; info?: string };
  suggestions: DqlSuggestion[];
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

interface QueryApiRequest {
  path: "query:verify" | "query:autocomplete";
  body: Record<string, unknown>;
  signal: AbortSignal | undefined;
}

/** Sends the request with the 10 s timeout; maps timeout and network failures to user-facing errors. */
async function postWithTimeout(
  endpoint: string,
  accessToken: string,
  { body, signal }: QueryApiRequest,
): Promise<{ response: Response; rawText: string }> {
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
    return { response, rawText: await response.text() };
  } catch (fetchErr) {
    if (timeoutSignal.aborted) throw new Error(`Dynatrace is not responding (${TIMEOUT_MS / 1000}s timeout)`);
    if (isNetworkError(fetchErr)) throw environmentNetworkError(fetchErr, endpoint);
    throw fetchErr; // includes the caller's AbortError
  }
}

/** Error for a non-2xx response: Dynatrace's own message when the body has one, else the status line. */
function httpError(status: number, rawText: string, path: string): Error {
  const body = parseErrorBody(rawText);
  return new Error(body ? `Dynatrace: ${body.message}` : `HTTP ${status} from ${path}`);
}

async function postQueryApi(tenant: TenantConfig, request: QueryApiRequest, isRetry = false): Promise<unknown> {
  const accessToken = await acquireAccessToken(tenant);
  const endpoint = `${tenant.tenantEndpoint.replace(/\/$/, "")}/platform/storage/query/v1/${request.path}`;
  const { response, rawText } = await postWithTimeout(endpoint, accessToken, request);

  if (response.status === 401 && !isRetry) {
    invalidateTokenCache(tenant.id);
    return postQueryApi(tenant, request, true);
  }
  if (!response.ok) throw httpError(response.status, rawText, request.path);
  return JSON.parse(rawText);
}

// ── Public API ────────────────────────────────────────────────────────────────

function toSeverity(s: string | undefined): DqlIssue["severity"] {
  return s === "ERROR" || s === "WARN" ? s : "INFO";
}

export function normalizeVerification(raw: unknown): DqlVerification {
  const parsed = verifyResponseSchema.parse(raw);
  return {
    valid: parsed.valid,
    issues: (parsed.notifications ?? []).map((n) => ({
      severity: toSeverity(n.severity),
      message: n.message,
      line: n.syntaxPosition?.start.line,
      column: n.syntaxPosition?.start.column,
    })),
  };
}

/** Checks a query for syntax and semantic errors without running it. */
export async function verifyDql(
  tenant: TenantConfig,
  query: string,
  opts: { signal?: AbortSignal } = {},
): Promise<DqlVerification> {
  return normalizeVerification(
    await postQueryApi(tenant, { path: "query:verify", body: { query }, signal: opts.signal }),
  );
}

const TRAILING_PARTS = new Set(["SPACE", "PARENTHESIS_OPEN"]);

export function normalizeCompletion(raw: unknown): DqlCompletion {
  const parsed = autocompleteResponseSchema.parse(raw);
  let context: DqlCompletion["context"];
  const seen = new Set<string>();
  const suggestions: DqlSuggestion[] = [];

  for (const s of parsed.suggestions) {
    const main = s.parts.find((p) => !TRAILING_PARTS.has(p.type)) ?? s.parts[0];
    if (main?.type === "SYNOPSIS_INFO") context = { synopsis: main.synopsis, info: main.info };
    // Placeholders ("" for a parameter key or "some custom field") cannot be inserted.
    if (!s.suggestion.trim() || seen.has(s.suggestion)) continue;
    seen.add(s.suggestion);
    suggestions.push({
      text: s.suggestion,
      replaceChars: s.alreadyTypedCharacters,
      kind: main?.type ?? "UNKNOWN",
      label: main?.suggestion || s.suggestion.trim(),
      info: main?.info,
      synopsis: main?.synopsis,
      dataType: main?.dataType,
    });
  }
  return { context, suggestions };
}

/** Suggestions for what can follow the cursor (default: end of the query). */
export async function autocompleteDql(
  tenant: TenantConfig,
  query: string,
  opts: { cursorPosition?: number; signal?: AbortSignal } = {},
): Promise<DqlCompletion> {
  const raw = await postQueryApi(tenant, {
    path: "query:autocomplete",
    body: { query, cursorPosition: opts.cursorPosition ?? query.length, maxDataSuggestions: 50 },
    signal: opts.signal,
  });
  return normalizeCompletion(raw);
}

/** The query with the suggestion inserted at the cursor (default: end of the query). */
export function applySuggestion(
  query: string,
  suggestion: Pick<DqlSuggestion, "text" | "replaceChars">,
  cursorPosition = query.length,
): string {
  return query.slice(0, cursorPosition - suggestion.replaceChars) + suggestion.text + query.slice(cursorPosition);
}
