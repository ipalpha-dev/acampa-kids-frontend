import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCamper, fetchCamperResponsibles, type Camper, type CamperResponsibles, type Responsible } from "../api/campers";
import { fetchHealthLists, fetchPersonData, type HealthList, type PersonDataKind, type PersonDataMap } from "../api/people";
import { fetchStaff, type Staff } from "../api/staff";
import { useI18n, type Locale } from "../i18n";
import { useCollectionOrEmpty } from "../store";
import { rememberPeople } from "../store/people";

export interface Live<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Reads something live when the screen shows it (never cached; `enabled: false` waits for a tap). */
function useLive<T>(key: string | null, load: () => Promise<T>): Live<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setData(null);
    setError(null);
    if (!key) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    load()
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}

/** The kid's page: camp ops + name + health (roles allowed) + responsáveis, read live (GET /api/campers/:id). */
export function useCamperLive(token: string, id: string | null): Live<Camper & { responsibles: Responsible[] }> {
  return useLive(id ? `camper:${id}` : null, async () => {
    const c = await fetchCamper(token, id!);
    rememberPeople([{ personId: c.id, name: c.name, nickname: c.nickname, sex: c.sex }, ...c.responsibles.map((r) => ({ personId: r.personId, name: r.name }))]);
    return c;
  });
}

/**
 * A kid's responsáveis (names only), read live when someone asks to talk to the
 * family (GET /api/campers/:id/responsibles) — never the kid's page, so no
 * health is read for a contact button. Phones are read per responsável on tap.
 */
export function useCamperResponsibles(token: string, id: string | null): Live<CamperResponsibles> {
  return useLive(id ? `responsibles:${id}` : null, async () => {
    const res = await fetchCamperResponsibles(token, id!);
    rememberPeople([{ personId: res.camper.id, name: res.camper.name }, ...res.responsibles.map((r) => ({ personId: r.personId, name: r.name }))]);
    return res;
  });
}

/** One team member's page: camp ops + name + health (self / managers), read live (GET /api/staff/:id). */
export function useStaffLive(token: string, id: string | null): Live<Staff> {
  return useLive(id ? `staff:${id}` : null, async () => {
    const s = await fetchStaff(token, id!);
    rememberPeople([{ personId: s.id, name: s.name, nickname: s.nickname, sex: s.sex }]);
    return s;
  });
}

/**
 * One data kind of one person, read with the acting role token (core's role
 * rules decide; every read is logged for the person). Pass `enabled: false`
 * to wait for a tap — contacts are fetched only when someone asks to see them.
 */
export function usePersonData<K extends PersonDataKind>(token: string, personId: string | null, kind: K, enabled = true): Live<PersonDataMap[K]> {
  return useLive(personId && enabled ? `${kind}:${personId}` : null, () => fetchPersonData(token, personId!, kind));
}

// ── health option labels (church lists + Acampa's import categories) ─────────

let listsPromise: Promise<HealthList[]> | null = null;
let listsToken: string | null = null;

/** The church health lists, fetched once per session token. */
export function loadHealthLists(token: string): Promise<HealthList[]> {
  if (!listsPromise || listsToken !== token) {
    listsToken = token;
    listsPromise = fetchHealthLists(token).catch((err) => {
      listsPromise = null;
      throw err;
    });
  }
  return listsPromise;
}

const LIST_LANG: Record<Locale, string[]> = { pt: ["pt-BR", "pt"], en: ["en-US", "en"], es: ["es"], fr: ["fr"], de: ["de"] };

function labelIn(label: HealthList["options"][number]["label"], locale: Locale): string {
  if (typeof label === "string") return label;
  for (const k of [...LIST_LANG[locale], "pt-BR", "pt"]) if (label[k]) return label[k];
  return Object.values(label)[0] ?? "";
}

/** health option id → label (church health lists first, then Acampa's own categories), "" when unknown. */
export function useHealthLabel(token: string): (id: string) => string {
  const { locale } = useI18n();
  const categories = useCollectionOrEmpty("categories");
  const [lists, setLists] = useState<HealthList[]>([]);
  useEffect(() => {
    let alive = true;
    loadHealthLists(token)
      .then((l) => alive && setLists(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) for (const o of c.options) map.set(o.id, o.label);
    for (const l of lists) for (const o of l.options) map.set(o.id, labelIn(o.label, locale));
    return (id: string) => map.get(id) ?? "";
  }, [categories, lists, locale]);
}
