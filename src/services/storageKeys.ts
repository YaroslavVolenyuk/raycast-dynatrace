// Central registry of all LocalStorage keys used by this extension.
// Never use string literals for storage keys outside this file.

export const StorageKeys = {
  // Tenant management
  tenants: "tenants:v1",
  tenantsActive: "tenants:active",
} as const;
