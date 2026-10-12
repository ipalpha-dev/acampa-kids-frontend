import { useEffect, useRef, useState } from "react";
import { aiDedupField, type DedupField } from "../api/ai";
import { loadAuth } from "../auth/store";

interface Options {
  token: string;
  /** the form is saving / disabled — don't start a pass */
  busy?: boolean;
  /** override who may run it; default: the acting role is coordenação or saúde (the server's rule, D32) */
  enabled?: boolean;
}

/** D32: the field clean-up handles health / family text — coordenação and the health team only (the server refuses others) */
export function mayCleanFields(): boolean {
  return ["coordenacao", "saude"].includes(loadAuth()?.user.activeRole ?? "");
}

/**
 * Background "remove repeats" pass for individual free-text fields. On blur a
 * field hands its current value to the server (GLM 5.3 flash), which drops any
 * entry written twice and returns the cleaned text. It's best-effort and
 * silent: a failure or an unchanged answer does nothing.
 *
 * Usage: `const dedup = useFieldDedup({ token, busy });` then on a field's blur
 * call `dedup.run("emergencyContact", value, setValue)`. `dedup.busy("…")` is
 * true while that field's request is in flight (drives the pulsing background).
 *
 * Only one request per field runs at a time; a newer blur cancels the older.
 * `cancelAll()` aborts everything (call it before submit).
 */
export function useFieldDedup({ token, busy, enabled = mayCleanFields() }: Options) {
  // one AbortController per field currently in flight
  const inflight = useRef(new Map<DedupField, AbortController>());
  // last value we already sent for a field, so an unchanged blur doesn't re-run
  const seen = useRef(new Map<DedupField, string>());
  const [running, setRunning] = useState<Record<string, boolean>>({});

  useEffect(() => () => cancelAll(), []);

  function setBusy(field: DedupField, on: boolean) {
    setRunning((r) => (r[field] === on ? r : { ...r, [field]: on }));
  }

  function cancel(field: DedupField) {
    inflight.current.get(field)?.abort();
    inflight.current.delete(field);
    setBusy(field, false);
  }

  function cancelAll() {
    for (const ctrl of inflight.current.values()) ctrl.abort();
    inflight.current.clear();
    setRunning({});
  }

  async function run(field: DedupField, value: string, apply: (v: string) => void) {
    const text = value.trim();
    // nothing worth a round-trip: needs at least two entries to have a repeat
    if (!enabled || busy || !text || !/[\n,/]/.test(text) || seen.current.get(field) === text) return;
    cancel(field);
    const ctrl = new AbortController();
    inflight.current.set(field, ctrl);
    seen.current.set(field, text);
    setBusy(field, true);
    try {
      const { value: cleaned, changed } = await aiDedupField(token, field, value, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (changed) {
        apply(cleaned);
        seen.current.set(field, cleaned.trim());
      }
    } catch {
      // best-effort: ignore
    } finally {
      if (inflight.current.get(field) === ctrl) {
        inflight.current.delete(field);
        setBusy(field, false);
      }
    }
  }

  /**
   * Fire the dedup pass on several fields AT ONCE (each its own request, all in
   * flight together). Use right after the notes sorter fills multiple fields:
   * pass one entry per field it changed. Fields that don't need a round-trip
   * (empty, single entry, unchanged) are skipped by `run`.
   */
  function runMany(jobs: { field: DedupField; value: string; apply: (v: string) => void }[]) {
    for (const j of jobs) void run(j.field, j.value, j.apply);
  }

  return {
    run,
    runMany,
    cancel,
    cancelAll,
    /** true while this field's dedup request is in flight (pulsing background) */
    busy: (field: DedupField) => !!running[field],
  };
}
