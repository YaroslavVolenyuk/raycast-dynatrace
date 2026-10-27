// Minimal mock of @raycast/api for unit tests.
// SDK code (src/sdk) never imports @raycast/api; only services/ui do, so this
// mock only needs to cover what those layers exercise in tests.

// Map-backed LocalStorage mock so tests can exercise real read/write round-trips.
const _localStorageMap = new Map<string, string>();
export const LocalStorage = {
  getItem: jest.fn(async (key: string) => _localStorageMap.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    _localStorageMap.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    _localStorageMap.delete(key);
  }),
  // Helper for tests to reset state between cases
  _clear: () => _localStorageMap.clear(),
};

// Extension preferences; tests set them with _setPreferences.
let _preferences: Record<string, unknown> = {};
export const getPreferenceValues = jest.fn(() => _preferences);
export const _setPreferences = (prefs: Record<string, unknown>) => {
  _preferences = prefs;
};

export const showToast = jest.fn();

export const Toast = {
  Style: {
    Failure: "failure",
    Success: "success",
    Animated: "animated",
  },
};

export const Color = {
  Red: "raycast-color-red",
  Orange: "raycast-color-orange",
  Yellow: "raycast-color-yellow",
  Green: "raycast-color-green",
  Blue: "raycast-color-blue",
  SecondaryText: "raycast-color-secondary",
};

// Map-backed Cache mock (one shared store, like Cache without a namespace).
const _cacheMap = new Map<string, string>();
export class Cache {
  get = (key: string) => _cacheMap.get(key);
  set = (key: string, value: string) => {
    _cacheMap.set(key, value);
  };
  static _clear = () => _cacheMap.clear();
}

export const environment = { isDevelopment: false, launchType: "userInitiated" };
