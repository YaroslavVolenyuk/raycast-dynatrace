// Chooses live vs mock transport based on the Raycast `useMockData` preference.
// This is the single place the decision is made; the SDK stays Raycast-free and
// resources receive whichever transport this returns without knowing which.

import { getPreferenceValues } from "@raycast/api";
import { liveTransport, type DynatraceTransport } from "../sdk";
import { createMockTransport } from "../mocks";

interface ExtensionPrefs {
  useMockData?: boolean;
}

export function resolveTransport(): DynatraceTransport {
  const { useMockData } = getPreferenceValues<ExtensionPrefs>();
  return useMockData ? createMockTransport() : liveTransport;
}
