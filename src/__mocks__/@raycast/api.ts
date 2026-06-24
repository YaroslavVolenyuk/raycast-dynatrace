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

export const getPreferenceValues = jest.fn(() => ({}));
export const openExtensionPreferences = jest.fn();
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
