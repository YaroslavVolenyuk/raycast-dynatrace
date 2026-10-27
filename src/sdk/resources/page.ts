/** A list of normalized entries plus how many raw records could not be read. */
export interface ResourcePage<T> {
  entries: T[];
  /** Records that failed schema validation and were left out. Shown to the user, never dropped silently. */
  skipped: number;
}

/** Validates and normalizes raw records, counting the ones that fail instead of hiding them. */
export function normalizeRecords<R, T>(
  records: readonly unknown[],
  schema: { safeParse: (v: unknown) => { success: true; data: R } | { success: false } },
  normalize: (record: R) => T,
): ResourcePage<T> {
  const page: ResourcePage<T> = { entries: [], skipped: 0 };
  for (const record of records) {
    const parsed = schema.safeParse(record);
    if (parsed.success) page.entries.push(normalize(parsed.data));
    else page.skipped++;
  }
  return page;
}
