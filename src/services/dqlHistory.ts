// Last query and timeframe of Run DQL, restored when the command opens again.

import { LocalStorage } from "@raycast/api";
import { StorageKeys } from "./storageKeys";

export async function getLastDqlQuery(): Promise<string | undefined> {
  return (await LocalStorage.getItem<string>(StorageKeys.dqlLastQuery)) || undefined;
}

export async function setLastDqlQuery(query: string): Promise<void> {
  await LocalStorage.setItem(StorageKeys.dqlLastQuery, query);
}

export async function getLastDqlTimeframe(): Promise<string | undefined> {
  return (await LocalStorage.getItem<string>(StorageKeys.dqlLastTimeframe)) || undefined;
}

export async function setLastDqlTimeframe(timeframe: string): Promise<void> {
  await LocalStorage.setItem(StorageKeys.dqlLastTimeframe, timeframe);
}
