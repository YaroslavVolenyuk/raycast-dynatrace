/**
 * SDK · resources — one module per resource. (Phase 1)
 *
 * Each module = endpoints + zod schemas + normalizers (API → domain model).
 * Resources export normalized domain models, never raw API shapes. Every
 * endpoint ships a sanitized live fixture under __fixtures__/ with a contract
 * test asserting `schema.parse(fixture)` succeeds.
 */
export {};
