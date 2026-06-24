/**
 * Layer 2 — application logic.
 *
 * No fetch, no JSX. Composes SDK calls into app behavior. May import src/sdk,
 * must not import src/ui. Future modules: savedQueries, export, deepLinks.
 */
export { StorageKeys } from "./storageKeys";
export { listTenants, saveTenant, deleteTenant, getActiveTenant, setActiveTenant } from "./tenants";
export { resolveTransport } from "./transport";
