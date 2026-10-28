// Checks the query with query:verify while the user types (debounced), so a
// syntax error shows under the Query field before anything runs. Verification
// does not execute the query and does not consume query budget.

import { useEffect, useState } from "react";
import { verifyDql, type DqlIssue, type TenantConfig } from "../../../sdk";

const DEBOUNCE_MS = 600;

interface DqlVerificationState {
  /** Error text for the Query field, undefined when the query is valid or unchecked. */
  error?: string;
  /** The query `error` belongs to — lets submit block only on a known-invalid query. */
  checkedQuery?: string;
}

/** "Line 2, col 3: There's no command `filtr`." (+N more) for the first error. */
export function describeIssues(issues: readonly DqlIssue[]): string | undefined {
  const errors = issues.filter((i) => i.severity === "ERROR");
  if (errors.length === 0) return undefined;
  const [first] = errors;
  const where = first.line != null ? `Line ${first.line}, col ${first.column}: ` : "";
  const more = errors.length > 1 ? ` (+${errors.length - 1} more)` : "";
  return `${where}${first.message}${more}`;
}

export function useDqlVerification(tenant: TenantConfig | null | undefined, query: string): DqlVerificationState {
  const [state, setState] = useState<DqlVerificationState>({});

  useEffect(() => {
    const trimmed = query.trim();
    if (!tenant || !trimmed) {
      setState({});
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      verifyDql(tenant, trimmed, { signal: ctrl.signal })
        .then((v) => setState({ error: describeIssues(v.issues), checkedQuery: trimmed }))
        // A failed check (offline, auth) is not a query error: running the query will report it.
        .catch(() => !ctrl.signal.aborted && setState({}));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [tenant?.id, query]);

  return state;
}
