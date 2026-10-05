import { useEffect, useRef, useState } from "react";
import { aiCamperNotes, type AiNotesSubject, type CamperNotesFields } from "../api/ai";
import { useI18n } from "../i18n";

/** while the sorter runs, saving waits at least this long so the answer can land */
export const AI_NOTES_MIN_WAIT_MS = 8_000;

interface Options {
  token: string;
  /** whose form: decides which fields the server fills */
  subject: AiNotesSubject;
  /** text already in the box when the form opened — a blur without changes doesn't re-run the sorter */
  initialNotes: string;
  /** what the form holds right now (read when the sorter fires) */
  getCurrent: () => Partial<CamperNotesFields>;
  /** apply the answer to the form (the leftover text is in `fields.generalNotes` / `fields.healthNotes`) */
  apply: (fields: CamperNotesFields) => void;
  /** the form is saving / disabled */
  busy?: boolean;
}

/**
 * The ✨ "organizar com IA" behaviour of a free-text observations box: on
 * paste or blur the text goes to the server, which spreads it over the
 * form's health / preference / contact fields and returns what's left.
 *
 * - `sort(text)` fires the request (skipped when off, empty, unchanged or busy).
 * - `holding` is true for the first 8 s of a request: the Save button must be
 *   disabled meanwhile. After that the user may save; call `cancel()` first so
 *   an answer never lands after the submit.
 * - `on` / `toggle()` is the switch state (a request in flight is cancelled on off).
 */
export function useAiNotesSorter({ token, subject, initialNotes, getCurrent, apply, busy }: Options) {
  const [on, setOn] = useState(true);
  const [running, setRunning] = useState(false);
  /** save stays disabled until this instant while the sorter runs */
  const [holdUntil, setHoldUntil] = useState(0);
  const { te } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const seen = useRef(initialNotes.trim());
  // re-render when the hold window ends so the Save button wakes up
  const [, tick] = useState(0);
  useEffect(() => {
    if (!holdUntil) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(0, holdUntil - Date.now()) + 20);
    return () => clearTimeout(t);
  }, [holdUntil]);
  useEffect(() => () => abort.current?.abort(), []);

  function cancel() {
    abort.current?.abort();
    abort.current = null;
    setRunning(false);
    setHoldUntil(0);
  }

  async function sort(text: string) {
    const notes = text.trim();
    if (!on || !notes || notes === seen.current || busy) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    seen.current = notes;
    setRunning(true);
    setError(null);
    setHoldUntil(Date.now() + AI_NOTES_MIN_WAIT_MS);
    try {
      const { fields } = await aiCamperNotes(token, { notes, subject, current: getCurrent() }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      apply(fields);
      seen.current = (subject === "staff" ? fields.healthNotes : fields.generalNotes).trim();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      seen.current = "";
      setError(te(err, "O assistente não respondeu."));
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setRunning(false);
        setHoldUntil(0);
      }
    }
  }

  return {
    on,
    toggle: () => {
      if (on) cancel();
      setOn(!on);
    },
    running,
    holding: running && Date.now() < holdUntil,
    error,
    sort,
    cancel,
  };
}
