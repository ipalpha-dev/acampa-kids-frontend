import { useEffect, useMemo, useState } from "react";
import { importFromCamp, searchCampCampers, searchCampStaff, type CampCamperRow, type CampStaffRow } from "../../api/camps";
import type { CampSummary } from "../../auth/store";
import { ROOM_ROLE_META } from "../../api/staff";
import Breadcrumbs from "../../components/Breadcrumbs";
import SearchField from "../../components/SearchField";
import { ICONS } from "../../icons";
import { setPendingToast } from "../../pendingToast";
import { useI18n } from "../../i18n";

type Row = CampCamperRow | CampStaffRow;
function isCamperRow(kind: "campers" | "staff", _row: Row): _row is CampCamperRow {
  return kind === "campers";
}

interface ImportYearPageProps {
  kind: "campers" | "staff";
  token: string;
  /** every other camp this session may switch into (the current one is excluded) */
  otherCamps: CampSummary[];
  onBack: () => void;
  onDone: () => void;
}

/** Acampantes / Equipe → Importar → Outro ano: pick people from another camp and copy just them into this year. */
export default function ImportYearPage({ kind, token, otherCamps, onBack, onDone }: ImportYearPageProps) {
  const { tx, te } = useI18n();
  const sorted = useMemo(() => otherCamps.slice().sort((a, b) => b.year - a.year), [otherCamps]);
  const [sourceId, setSourceId] = useState<string | null>(sorted[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!sourceId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    const fetcher = kind === "campers" ? searchCampCampers : searchCampStaff;
    fetcher(token, sourceId, query)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setSelected((prev) => new Set([...prev].filter((id) => r.some((row) => row.id === id))));
      })
      .catch((e) => alive && setError(te(e, "Algo deu errado.")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sourceId, query, kind]);

  function changeSource(id: string) {
    if (id === sourceId) return;
    setSourceId(id);
    setSearch("");
    setQuery("");
    setRows(null);
    setSelected(new Set());
    setError(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!rows) return;
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function doImport() {
    if (!sourceId || selected.size === 0 || importing) return;
    setImporting(true);
    setError(null);
    try {
      const ids = [...selected];
      const onMatch = ids.some((id) => rows?.find((r) => r.id === id)?.matched) ? "update" : "skip";
      const result = await importFromCamp(token, sourceId, kind === "campers" ? { camperIds: ids, onMatch } : { staffIds: ids, onMatch });
      const r = result[kind];
      const n = r ? r.created + r.updated : ids.length;
      const waiting = r?.membershipsFailed ?? 0;
      setPendingToast(
        waiting > 0
          ? tx("✅ {n} importado(s). {m} ainda precisa(m) ser incluído(s) nesta edição pelo Mordomia — com calma, ninguém se perdeu.", { n, m: waiting })
          : tx("✅ {n} importado(s)", { n }),
      );
      onDone();
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setImporting(false);
    }
  }

  const rootLabel = kind === "campers" ? tx("Acampantes") : tx("Equipe");

  return (
    <div className="admin-page import-page">
      <Breadcrumbs items={[{ label: rootLabel, onClick: onBack }, { label: tx("Outro ano") }]} />
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.previousYear} alt="" aria-hidden="true" /> {tx("Importar de outro ano")}
        </h1>
      </header>

      {sorted.length === 0 && <p className="opt-empty">{tx("Não há outro ano para importar.")}</p>}

      {sorted.length > 1 && (
        <div className="import-year__chips" role="group" aria-label={tx("Ano de origem")}>
          {sorted.map((c) => (
            <button key={c.id} type="button" className={`role-chip role-chip--small ${c.id === sourceId ? "role-chip--bare" : "role-chip--switch"}`} aria-pressed={c.id === sourceId} onClick={() => changeSource(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <>
          <div className="staff-toolbar">
            <SearchField
              placeholder={tx("Nome")}
              value={search}
              onChange={setSearch}
              aria-label={tx("Buscar")}
            />
          </div>

          {error && <p className="message message--error">{error}</p>}

          {loading && <p className="opt-empty">{tx("Buscando… 🔍")}</p>}

          {!loading && rows && rows.length === 0 && <p className="opt-empty">{query ? tx("Nenhum resultado. 🔍") : tx("Ninguém encontrado em {label}.", { label: sorted.find((c) => c.id === sourceId)?.label ?? "" })}</p>}

          {!loading && rows && rows.length > 0 && (
            <>
              <p className="admin-intro">
                <button type="button" className="link-btn" onClick={toggleAll}>
                  {selected.size === rows.length ? tx("Limpar seleção") : tx("Selecionar todos ({n})", { n: rows.length })}
                </button>
              </p>
              <ul className="staff-list">
                {rows.map((row) => (
                  <li key={row.id} className="staff-card import-year__row" onClick={() => toggle(row.id)}>
                    <input type="checkbox" className="import-year__checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} onClick={(e) => e.stopPropagation()} aria-label={tx("Selecionar {name}", { name: row.name })} />
                    <div className="staff-card__body">
                      <h3 className="staff-card__name">{row.name || tx("Nome indisponível no momento")}</h3>
                      {(row.bedroom || row.team || (!isCamperRow(kind, row) && row.roomRole)) && (
                        <div className="staff-card__tags">
                          {row.bedroom && <span className="staff-tag">{row.bedroom}</span>}
                          {!isCamperRow(kind, row) && row.roomRole && <span className="staff-tag">{tx(ROOM_ROLE_META[row.roomRole].label)}</span>}
                          {row.team && <span className="staff-tag">{row.team}</span>}
                        </div>
                      )}
                      {row.matched && <span className="import-year__matched">{tx("já está neste ano")}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {rows && selected.size > 0 && (
            <footer className="import-year__footer">
              <span className="cat-hint">{tx("{n} selecionado(s)", { n: selected.size })}</span>
              <button type="button" className="button button--primary" disabled={importing} onClick={() => void doImport()}>
                {importing ? tx("Importando…") : tx("Importar {n} selecionado(s)", { n: selected.size })}
              </button>
            </footer>
          )}
          <p className="cat-hint">{tx("Pode repetir sem medo: quem já está neste ano só é atualizado se você marcar.")}</p>
        </>
      )}
    </div>
  );
}
