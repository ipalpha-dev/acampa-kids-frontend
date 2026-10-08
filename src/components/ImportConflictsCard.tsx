import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APP_FIELD_LABEL, fetchImportConflicts, resolveImportConflicts, type ImportConflict, type ImportSubject } from "../api/imports";
import { ROOM_ROLE_META, type RoomRole } from "../api/staff";
import { transportLabel } from "../api/transports";
import { useI18n } from "../i18n";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useNames, unnamedText } from "../store/people";
import styles from "./ImportConflictsCard.module.scss";

/**
 * Decision 78 — "Valores da importação para conferir": an import brought a
 * value for a camp field someone had already changed by hand, so Acampa kept
 * the current one and asks here, in the same style as the import's own
 * questions: "Aplicar valor da importação" / "Manter o atual" (one by one or
 * all at once). Shown on the campers page (kids' fields) and the team page
 * (team fields) to the organização. Live: re-read whenever the list changes.
 * Ids + camp-ops values only; names come from the people cache.
 */

interface Props {
  token: string;
  subject: ImportSubject;
}

type Tx = (pt: string, vars?: Record<string, string | number>) => string;

export default function ImportConflictsCard({ token, subject }: Props) {
  const { tx } = useI18n();
  const [items, setItems] = useState<ImportConflict[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // the list itself is live (WebSocket); any change re-reads the open decisions
  const live = useCollection(subject === "camper" ? "campers" : "staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const transports = useCollectionOrEmpty("transports");
  const teams = useCollectionOrEmpty("teams");
  const nameOf = useNames(useMemo(() => items.map((i) => i.personId), [items]));
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await fetchImportConflicts(token, subject);
      if (alive.current) setItems(next);
    } catch {
      // stays as it was; the next change re-reads
    }
  }, [token, subject]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load, live]);

  const valueLabel = useCallback(
    (field: string, value: string | null): string => {
      if (!value) return tx("(vazio)");
      switch (field) {
        case "bedroom": {
          const room = bedrooms.find((b) => b.id === value);
          return room ? tx("Quarto {name}", { name: room.name }) : tx("um quarto que não existe mais");
        }
        case "transportation": {
          const t = transports.find((x) => x.id === value);
          return t ? transportLabel(t) : tx("um transporte que não existe mais");
        }
        case "team":
          return teams.find((x) => x.id === value)?.name ?? tx("um time que não existe mais");
        case "roomRole":
          return ROOM_ROLE_META[value as RoomRole] ? tx(ROOM_ROLE_META[value as RoomRole].label) : value;
        default:
          return `“${value}”`;
      }
    },
    [tx, bedrooms, transports, teams],
  );

  async function resolve(ids: string[], choice: "import" | "keep") {
    if (busy) return;
    setBusy(ids.length === 1 ? ids[0] : "all");
    setProblem(null);
    try {
      const res = await resolveImportConflicts(token, ids, choice);
      if (res.failed.length > 0) setProblem(failureMessage(tx, res.failed[0].code));
      const failed = new Set(res.failed.map((f) => f.id));
      setItems((prev) => prev.filter((i) => !ids.includes(i.id) || failed.has(i.id)));
    } catch {
      setProblem(tx("Não foi possível guardar agora. Tente de novo."));
    } finally {
      setBusy(null);
      void load();
    }
  }

  const ids = items.map((i) => i.id);
  return (
    <Reveal open={items.length > 0}>
      <section className={styles.card} aria-label={tx("Valores da importação para conferir")}>
        <header className={styles.head}>
          <h2 className={styles.title}>
            {tx("Valores da importação para conferir")} <span className={styles.badge}>{items.length}</span>
          </h2>
          <p className="cat-hint">{tx("Alguém já tinha mudado estes campos à mão, então mantivemos o que estava. Escolha qual valor fica.")}</p>
        </header>
        <Reveal open={!!problem}>
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        </Reveal>
        <ul className={styles.list}>
          {items.map((item) => {
            const label = APP_FIELD_LABEL[item.field] ? tx(APP_FIELD_LABEL[item.field]) : item.field;
            const who = nameOf(item.personId) || tx(unnamedText(item.personId));
            return (
              <li key={item.id} className={styles.item}>
                <p className={styles.itemHead}>
                  <strong>{who}</strong> · {label}
                </p>
                <dl className={styles.values}>
                  <div className={styles.value}>
                    <dt>{tx("Na planilha")}</dt>
                    <dd>{valueLabel(item.field, item.importValue)}</dd>
                  </div>
                  <div className={`${styles.value} ${styles.valueNow}`}>
                    <dt>{tx("Agora")}</dt>
                    <dd>{valueLabel(item.field, item.currentValue)}</dd>
                  </div>
                </dl>
                <div className={styles.actions}>
                  <button type="button" className={styles.choice} disabled={!!busy} onClick={() => void resolve([item.id], "import")} aria-label={tx("Aplicar valor da importação para {name} ({field})", { name: who, field: label })}>
                    {tx("Aplicar valor da importação")}
                  </button>
                  <button type="button" className={styles.choice} disabled={!!busy} onClick={() => void resolve([item.id], "keep")} aria-label={tx("Manter o atual para {name} ({field})", { name: who, field: label })}>
                    {tx("Manter o atual")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {items.length > 1 && (
          <div className={styles.bulk}>
            <button type="button" className="button button--secondary button--small" disabled={!!busy} onClick={() => void resolve(ids, "keep")}>
              {tx("Manter todos os atuais")}
            </button>
            <button type="button" className="button button--primary button--small" disabled={!!busy} onClick={() => void resolve(ids, "import")}>
              {tx("Aplicar todos da importação")}
            </button>
          </div>
        )}
      </section>
    </Reveal>
  );
}

function failureMessage(tx: Tx, code: string): string {
  switch (code) {
    case "BEDROOM_FULL":
      return tx("Esse quarto já está lotado. Libere uma cama ou mantenha o atual.");
    case "BEDROOM_NOT_FOUND":
    case "TRANSPORT_NOT_FOUND":
    case "TEAM_NOT_FOUND":
      return tx("Essa opção não existe mais no acampamento. Mantenha o atual ou escolha outra na ficha.");
    default:
      return tx("Não foi possível aplicar esse valor agora.");
  }
}

/** Grows / shrinks with its real height instead of jumping. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(children);
  if (open) last.current = children;
  return (
    <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`} aria-hidden={open ? undefined : true}>
      <div className={styles.revealInner}>{last.current}</div>
    </div>
  );
}
