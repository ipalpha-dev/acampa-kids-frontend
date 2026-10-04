import { useEffect, useMemo, useRef, useState } from "react";
import { exactOrigin } from "../../auth/ipalpha";
import styles from "./IpalphaOneTap.module.scss";

/**
 * Local copy of shared-ui's `IpalphaOneTap` (CONTRACTS_ACAMPA §4) — Acampa does not depend on core
 * packages at runtime. The frame is served by the IPAlpha sign-in webapp and shows the accounts already
 * signed in on this device; this page never receives a name, photo or contact from it — only the chosen
 * `personId`, passed as `personHint` to the normal sign-in + consent.
 */

/** `type` of every message the One Tap frame posts to this page. */
export const ONE_TAP_MESSAGE_TYPE = "ipalpha:onetap";

const FRAME_PATH = "/one-tap";
/** The frame never answered (blocked cookies, auth down, origin not allowed): stop waiting. */
const READY_TIMEOUT_MS = 15_000;
/** Upper bound for a reported height: three accounts + actions fit well below it. */
const MAX_HEIGHT = 640;

export interface IpalphaOneTapProps {
  authOrigin: string;
  clientId: string;
  entryPoint: string;
  /** Accessible name of the frame. */
  title: string;
  /** The person picked an account: start the sign-in with this hint. */
  onSelect: (personId: string) => void;
  /** "Usar outra conta": start the sign-in without a hint. */
  onOther: () => void;
  /** The banner removed itself (`none` / `close`): stays hidden for this page view. */
  onDismiss: () => void;
}

type Phase = "waiting" | "shown" | "gone";

interface OneTapMessage {
  type: typeof ONE_TAP_MESSAGE_TYPE;
  event: "ready" | "resize" | "none" | "select" | "other" | "close";
  height?: unknown;
  personId?: unknown;
}

function isOneTapMessage(data: unknown): data is OneTapMessage {
  return !!data && typeof data === "object" && (data as { type?: unknown }).type === ONE_TAP_MESSAGE_TYPE && typeof (data as { event?: unknown }).event === "string";
}

function validHeight(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.ceil(value), MAX_HEIGHT) : null;
}

export default function IpalphaOneTap({ authOrigin, clientId, entryPoint, title, onSelect, onOther, onDismiss }: IpalphaOneTapProps) {
  const origin = useMemo(() => exactOrigin(authOrigin), [authOrigin]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [height, setHeight] = useState<number | null>(null);
  const handlers = useRef({ onSelect, onOther, onDismiss });
  handlers.current = { onSelect, onOther, onDismiss };

  const src = useMemo(() => {
    if (!origin) return null;
    const url = new URL(FRAME_PATH, origin);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("entry_point", entryPoint);
    url.searchParams.set("origin", window.location.origin);
    return url.toString();
  }, [origin, clientId, entryPoint]);

  useEffect(() => {
    if (!origin) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const frame = frameRef.current;
      if (!frame || !event.source || event.source !== frame.contentWindow) return;
      if (!isOneTapMessage(event.data)) return;
      const data = event.data;
      switch (data.event) {
        case "ready":
        case "resize": {
          const next = validHeight(data.height);
          if (next) setHeight(next);
          if (data.event === "ready") setPhase((p) => (p === "gone" ? p : "shown"));
          return;
        }
        case "none":
        case "close":
          setPhase("gone");
          handlers.current.onDismiss();
          return;
        case "select":
          if (typeof data.personId === "string" && data.personId) handlers.current.onSelect(data.personId);
          return;
        case "other":
          handlers.current.onOther();
          return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin]);

  useEffect(() => {
    if (phase !== "waiting" || !src) return;
    const timer = window.setTimeout(() => setPhase("gone"), READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, src]);

  if (!src || phase === "gone") return null;
  const shown = phase === "shown";
  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      className={`${styles.frame} ${shown ? styles.shown : ""}`}
      // the only inline value: the frame's reported content height (dynamic, runtime)
      style={height ? { height } : undefined}
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      aria-hidden={shown ? undefined : true}
      tabIndex={shown ? undefined : -1}
    />
  );
}
