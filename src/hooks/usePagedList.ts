import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../api/people";

export interface PagedList<T> {
  /** every item fetched so far, in order — rendered as ONE continuous list */
  items: T[];
  /** the server's total (when it tells), else null */
  total: number | null;
  /** a page is on its way */
  loading: boolean;
  /** the last page arrived */
  done: boolean;
  error: string | null;
  /** starts over from the first page */
  reload: () => void;
}

/**
 * Pages a cursor list in the BACKGROUND (decision 22): the first page renders
 * right away, the next ones keep arriving until `nextCursor` is null, and the
 * screen shows them as one continuous list. A new `key` (another filter)
 * starts over and drops whatever the previous key was still fetching; `null`
 * pauses (nothing fetched).
 */
export function usePagedList<T>(key: string | null, fetchPage: (cursor: string | null) => Promise<Page<T>>, opts: { onPage?: (items: T[]) => void } = {}): PagedList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const onPageRef = useRef(opts.onPage);
  onPageRef.current = opts.onPage;

  useEffect(() => {
    setItems([]);
    setTotal(null);
    setDone(false);
    setError(null);
    if (key === null) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    void (async () => {
      let cursor: string | null = null;
      const seen = new Set<string>();
      try {
        for (;;) {
          const page = await fetchRef.current(cursor);
          if (!alive) return;
          onPageRef.current?.(page.items);
          setItems((prev) => [...prev, ...page.items]);
          if (typeof page.total === "number") setTotal(page.total);
          // a cursor seen twice would loop forever: stop there
          if (!page.nextCursor || seen.has(page.nextCursor)) break;
          seen.add(page.nextCursor);
          cursor = page.nextCursor;
        }
        if (alive) setDone(true);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { items, total, loading, done, error, reload };
}

/** Non-hook version: every page, in order (background roster sync). Stops when `isAlive()` turns false. */
export async function fetchAllPages<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, onPage: (items: T[]) => void, isAlive: () => boolean = () => true): Promise<void> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (;;) {
    const page = await fetchPage(cursor);
    if (!isAlive()) return;
    onPage(page.items);
    if (!page.nextCursor || seen.has(page.nextCursor)) return;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
}
