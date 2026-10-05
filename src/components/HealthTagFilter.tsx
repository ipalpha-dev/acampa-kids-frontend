import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchHealthCounts, type HealthCounts } from "../api/people";
import { loadHealthLists, useHealthLabel } from "../hooks/usePersonData";
import { useI18n } from "../i18n";
import NoPillIcon from "./NoPillIcon";

/** Count endpoint takes at most this many tags per call. */
const TAGS_PER_CALL = 50;

const FIXED: { tag: string; icon: ReactNode; label: string }[] = [
  { tag: "medications", icon: "💊", label: "Medicação" },
  { tag: "foodRestrictions", icon: "🍽️", label: "Alimentação" },
  { tag: "neurodivergent", icon: "🧩", label: "Neurodivergente" },
];

const LIST_TAG: Record<string, { field: string; icon: ReactNode }> = {
  "condicao-cronica": { field: "healthIssues", icon: "⚠️" },
  alergias: { field: "allergies", icon: "🤮" },
  "alergia-medicamentos": { field: "drugAllergies", icon: <NoPillIcon /> },
};

interface HealthTagFilterProps {
  token: string;
  /** the selected tag (`allergies:<optionId>`, `medications`…) or null */
  value: string | null;
  onChange: (tag: string | null) => void;
}

/**
 * The health filter of the people lists (decisions 22 / 31): one chip per
 * health tag with its ANONYMIZED count (count endpoint — no names, not
 * logged); only tags somebody has are offered. Picking one asks the server
 * for that filtered list, which is the only list that shows health details.
 */
export default function HealthTagFilter({ token, value, onChange }: HealthTagFilterProps) {
  const { tx } = useI18n();
  const labelOf = useHealthLabel(token);
  const [tags, setTags] = useState<{ tag: string; icon: ReactNode; label: string | null }[]>(FIXED);
  const [counts, setCounts] = useState<HealthCounts | null>(null);

  useEffect(() => {
    let alive = true;
    loadHealthLists(token)
      .then((lists) => {
        if (!alive) return;
        const fromLists = lists.flatMap((l) => {
          const meta = LIST_TAG[l.key];
          if (!meta) return [];
          return l.options.filter((o) => o.active).sort((a, b) => a.order - b.order).map((o) => ({ tag: `${meta.field}:${o.id}`, icon: meta.icon, label: null }));
        });
        setTags([...FIXED, ...fromLists]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  const tagKey = tags.map((t) => t.tag).join(",");
  useEffect(() => {
    let alive = true;
    const all = tagKey.split(",");
    const chunks: string[][] = [];
    for (let i = 0; i < all.length; i += TAGS_PER_CALL) chunks.push(all.slice(i, i + TAGS_PER_CALL));
    Promise.all(chunks.map((c) => fetchHealthCounts(token, c)))
      .then((answers) => {
        if (!alive) return;
        const byTag: Record<string, number> = {};
        for (const a of answers) Object.assign(byTag, a.byTag);
        setCounts({ total: answers[0]?.total ?? 0, byTag });
      })
      .catch(() => alive && setCounts(null));
    return () => {
      alive = false;
    };
  }, [token, tagKey]);

  const shown = useMemo(() => tags.filter((t) => t.tag === value || (counts?.byTag[t.tag] ?? 0) > 0), [tags, counts, value]);
  if (!counts || shown.length === 0) return null;

  return (
    <div className="health-filter" role="group" aria-label={tx("Filtrar por saúde")}>
      {shown.map((t) => {
        const on = value === t.tag;
        const label = t.label ? tx(t.label) : labelOf(t.tag.split(":")[1] ?? "") || "—";
        return (
          <button key={t.tag} type="button" className={`chip-toggle chip-toggle--small ${on ? "chip-toggle--on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? null : t.tag)}>
            <span aria-hidden="true">{t.icon}</span> {label}
            <span className="cat-tab__count">{counts.byTag[t.tag] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
