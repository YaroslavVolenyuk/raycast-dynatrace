/**
 * Layer 2 — application logic.
 *
 * No fetch, no JSX. Composes SDK calls into app behavior. May import src/sdk,
 * must not import src/ui. Future modules: savedQueries, export, deepLinks.
 */
export { listTenants, saveTenant, deleteTenant, setActiveTenant, resetTenants, readTenantState } from "./tenants";
export { getLastDqlQuery, setLastDqlQuery, getLastDqlTimeframe, setLastDqlTimeframe } from "./dqlHistory";
