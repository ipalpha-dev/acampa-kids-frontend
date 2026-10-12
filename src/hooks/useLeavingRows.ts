import { useEffect, useMemo, useRef, useState } from "react";

export type RowState = "stay" | "enter" | "leave";

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * A list whose changes are visible: a row that appears is marked `enter`, one that disappears stays on screen as
 * `leave` for `ms` (so CSS can fade and collapse it) and then goes. The first load animates nothing, and with
 * `prefers-reduced-motion` rows simply appear and disappear. `sort` orders the rows including the leaving ones.
 */
export function useLeavingRows<T extends { id: string }>(list: readonly T[] | null, sort: (rows: T[]) => T[], ms = 240): (T & { rowState: RowState })[] {
  const before = useRef<Map<string, T> | null>(null);
  const timers = useRef<number[]>([]);
  const [leaving, setLeaving] = useState<Map<string, T>>(new Map());
  const [entering, setEntering] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (list === null) return;
    const now = new Map(list.map((x) => [x.id, x]));
    const prev = before.current;
    before.current = now;
    if (!prev || reducedMotion()) return;
    const removed = [...prev.values()].filter((x) => !now.has(x.id));
    const added = list.filter((x) => !prev.has(x.id)).map((x) => x.id);
    if (removed.length > 0) {
      setLeaving((l) => new Map([...l, ...removed.map((r) => [r.id, r] as const)]));
      timers.current.push(
        window.setTimeout(() => {
          setLeaving((l) => {
            const next = new Map(l);
            for (const r of removed) next.delete(r.id);
            return next;
          });
        }, ms),
      );
    }
    if (added.length > 0) {
      setEntering((e) => new Set([...e, ...added]));
      timers.current.push(
        window.setTimeout(() => {
          setEntering((e) => {
            const next = new Set(e);
            for (const id of added) next.delete(id);
            return next;
          });
        }, ms),
      );
    }
  }, [list, ms]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return useMemo(() => {
    const live = new Set((list ?? []).map((x) => x.id));
    const ghosts = [...leaving.values()].filter((x) => !live.has(x.id));
    return sort([...(list ?? []), ...ghosts]).map((x) => ({ ...x, rowState: (live.has(x.id) ? (entering.has(x.id) ? "enter" : "stay") : "leave") as RowState }));
  }, [list, leaving, entering, sort]);
}
