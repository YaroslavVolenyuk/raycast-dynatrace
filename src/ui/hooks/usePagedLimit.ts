import { useState } from "react";

/**
 * A result limit that Load More raises by `pageSize` up to `max`. The raised
 * limit belongs to `key`: when the key changes the limit is `initial` again.
 */
export function usePagedLimit(key: string, initial: number, pageSize: number, max: number) {
  const [loadedMore, setLoadedMore] = useState<{ key: string; limit: number }>();
  const limit = loadedMore?.key === key ? loadedMore.limit : initial;
  return {
    limit,
    /** A full page means more records probably exist. */
    canLoadMore: (received: number) => received >= limit && limit < max,
    loadMore: () => setLoadedMore({ key, limit: Math.min(limit + pageSize, max) }),
  };
}
