import { useMemo, useRef, useState, type ReactNode } from "react";
import { UndoGlyph } from "../components/Glyph";
import SearchField from "../components/SearchField";
import QrScannerDialog from "../components/QrScannerDialog";
import TeamTag from "../components/TeamTag";
import TransportTag from "../components/TransportTag";
import ScanFab from "../components/ScanFab";
import { camperIdFromQr } from "../print/camperLabels";
import { type Bedroom } from "../api/bedrooms";
import BedroomTag from "../components/BedroomTag";
import { ageOf, checkinCamper, EMPTY_HEALTH, undoCheckinCamper, type Camper } from "../api/campers";
import { useConfirm } from "../components/ConfirmDialog";
import Dialog from "../components/Dialog";
import Breadcrumbs from "../components/Breadcrumbs";
import { healthLines } from "../components/HealthAlerts";
import HealthHeart from "../components/HealthHeart";
import PersonContact from "../components/PersonContact";
import { useCamperLive, useHealthLabel } from "../hooks/usePersonData";
import { usePersonName } from "../store/people";
import styles from "../styles/ops.module.scss";
import KidIcon from "../components/KidIcon";
import ParentIcon from "../components/ParentIcon";
import { ICONS, kidIconSex } from "../icons";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useLabelOf } from "../store/derive";
import { useRoute } from "../router";
import { speakTime } from "../dates";
import { collatorLocale, useI18n } from "../i18n";

interface CheckinPageProps {
  token: string;
  /** the admin route is nested below the merged Check-in landing page */
  adminMerged?: boolean;
}

type Filter = "pending" | "done" | "all";

/**
 * Arrival day: search the kid by name, open the check-in dialog, have the
 * parent confirm each piece of health/contact info, then "Confirmar chegada".
 */
export default function CheckinPage({ token, adminMerged = false }: CheckinPageProps) {
  const { tx, te } = useI18n();
  const campers = useCollection("campers");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const transports = useCollectionOrEmpty("transports");
  const labelOf = useLabelOf();
  // the church roll call is only for kids coming by bus — the ones handed over to us there
  const busIds = useMemo(() => new Set(transports.filter((t) => t.kind === "bus").map((t) => t.id)), [transports]);
  const onBus = (k: Camper) => !!k.transportation && busIds.has(k.transportation);
  const { navigate } = useRoute();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the door works by QR: the camera is the first thing you see; close it to search by name
  const [scannerOpen, setScannerOpen] = useState(true);
  /** the open check-in came from a scan: once done, go back to the camera for the next kid */
  const fromScan = useRef(false);

  const roomById = useMemo(() => new Map(bedrooms.map((b) => [b.id, b])), [bedrooms]);

  const visible = useMemo(() => {
    if (!campers) return [];
    const q = normalize(search);
    return campers
      .filter(onBus)
      .sort((a, b) => a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" }))
      .filter((k) => {
        if (filter === "pending" && k.checkin) return false;
        if (filter === "done" && !k.checkin) return false;
        return !q || normalize(k.name).includes(q);
      });
  }, [campers, search, filter, busIds]);

  const counts = useMemo(() => {
    const bus = campers?.filter(onBus) ?? [];
    const done = bus.filter((k) => k.checkin).length;
    return { done, pending: bus.length - done, all: bus.length };
  }, [campers, busIds]);

  const open = openId ? campers?.find((k) => k.id === openId) ?? null : null;
  const openRoom = open?.bedroom ? roomById.get(open.bedroom) ?? null : null;

  async function handleConfirm(k: Camper) {
    setBusy(true);
    setError(null);
    try {
      await checkinCamper(token, k.id);
      setOpenId(null);
      if (fromScan.current) setScannerOpen(true);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  function openByName(k: Camper) {
    fromScan.current = false;
    setOpenId(k.id);
  }

  /** QR on the wristband / badge: jumps straight to the kid's check-in dialog (the parent still confirms every item there) */
  function scanQr(raw: string) {
    if (!campers) return;
    setError(null);
    const id = camperIdFromQr(raw);
    const camper = id ? campers.find((k) => k.id === id) : null;
    setScannerOpen(false);
    if (!id) setError(tx("Este QR code não é de uma pulseira ou crachá do Acampa Kids."));
    else if (!camper) setError(tx("Esta criança não está na lista do check-in."));
    else if (!onBus(camper)) setError(tx("{name} não vem de ônibus — o check-in da igreja é só para quem vem de ônibus.", { name: camper.name }));
    else {
      fromScan.current = true;
      setOpenId(camper.id);
    }
  }

  async function handleUndo(k: Camper) {
    if (!(await confirm({ emoji: <UndoGlyph />, title: tx("Desfazer o check-in de {name}?", { name: k.name }), message: tx("A criança voltará para a lista de pendentes."), confirmLabel: tx("Desfazer"), danger: true }))) return;
    setBusy(true);
    setError(null);
    try {
      await undoCheckinCamper(token, k.id);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  if (!campers) {
    return (
      <div className="admin-page">
        {adminMerged && <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate("/checkin") }, { label: tx("Igreja") }]} />}
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {adminMerged && <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate("/checkin") }, { label: tx("Igreja") }]} />}
      <header className="admin-head">
        <h1 className="admin-title">{tx("⛪ Check-in na igreja")}</h1>
        <div className="admin-head__actions">
          <span className="checkin-progress" title={tx("Crianças que já chegaram")}>
            ✅ {counts.done}/{counts.all}
          </span>
        </div>
      </header>


      {error && <p className="message message--error">{error}</p>}

      <div className="staff-toolbar">
        <SearchField
          placeholder={tx("Buscar pelo nome da criança…")}
          value={search}
          onChange={setSearch}
          aria-label={tx("Buscar pelo nome da criança")}
        />
        <div className="staff-toolbar__filters checkin-filters" role="tablist" aria-label={tx("Filtro")}>
          {(
            [
              ["pending", "Aguardando"],
              ["done", "Chegaram"],
              ["all", "Todos"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={filter === key} className={`cat-tab ${filter === key ? "cat-tab--active" : ""}`} onClick={() => setFilter(key)}>
              {tx(label)}
              <span className="cat-tab__count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {campers.length === 0 && (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.camper} alt="" aria-hidden="true" />
          <p>{tx("Nenhum acampante cadastrado.")}</p>
        </div>
      )}
      {campers.length > 0 && visible.length === 0 && (
        <p className="opt-empty">{filter === "pending" && !search ? tx("Todo mundo já chegou! 🎉") : tx("Nenhum resultado. 🔍")}</p>
      )}

      <ul className="staff-list">
        {visible.map((k) => {
          const room = k.bedroom ? roomById.get(k.bedroom) : null;
          const age = ageOf(k.birthDate ?? null);
          const done = !!k.checkin;
          return (
            <li key={k.id} className={`staff-card staff-card--clickable ${done ? "checkin-card--done" : ""}`}>
              <div
                className="staff-card__body"
                role="button"
                tabIndex={0}
                title={done ? tx("{name} já chegou", { name: k.name }) : tx("Fazer check-in de {name}", { name: k.name })}
                onClick={() => openByName(k)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openByName(k);
                  }
                }}
              >
                <h3 className="staff-card__name">
                  {done && <span aria-hidden="true">✅ </span>}
                  {k.name || "…"}
                  <HealthHeart show={k.hasHealth} />
                  {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
                </h3>
                <p className="staff-card__meta">
                  {room ? <BedroomTag bedroom={room} className="staff-tag--inline" /> : <span className="staff-card__missing">{tx("sem quarto")}</span>}
                  {k.team && (
                    <>
                      {" · "}
                      <TeamTag teamId={k.team} className="staff-tag--inline" />
                    </>
                  )}
                  {done && k.checkin && (
                    <span className="checkin-card__when" title={k.checkin.note}>
                      {" "}
                      · {tx("chegou às {time}", { time: speakTime(k.checkin.at) })}
                      {k.checkin.note && ` · ${tx("🤖 pelo sistema")}`}
                    </span>
                  )}
                </p>
              </div>
              {done && (
                <button type="button" className="icon-btn icon-btn--lg" title={tx("Desfazer check-in")} aria-label={tx("Desfazer check-in de {name}", { name: k.name })} disabled={busy} onClick={() => handleUndo(k)}>
                  <UndoGlyph />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!open} onClose={() => setOpenId(null)} title={open ? tx("Check-in de {name}", { name: open.name }) : tx("Check-in")} width={560}>
        {open && (
          <CheckinDialog
            key={open.id}
            token={token}
            camper={open}
            bedroom={openRoom}
            sex={kidIconSex(openRoom?.group, open?.sex)}
            labelOf={labelOf}
            busy={busy}
            onConfirm={() => handleConfirm(open)}
            onCancel={() => setOpenId(null)}
          />
        )}
      </Dialog>

      <ScanFab label={tx("Ler a pulseira ou o crachá")} onClick={() => setScannerOpen(true)} />
      <QrScannerDialog open={scannerOpen} onScan={scanQr} onClose={() => setScannerOpen(false)} hint={tx("Leia a pulseira ou o crachá para abrir o check-in da criança.")}>
        <p className="scan-points__summary" aria-live="polite">
          {tx(counts.all === 1 ? "{done} de {all} criança chegou" : "{done} de {all} crianças chegaram", { done: counts.done, all: counts.all })}
        </p>
      </QrScannerDialog>
    </div>
  );
}

// ── the dialog ─────────────────────────────────────────────────────────

interface CheckinDialogProps {
  token: string;
  camper: Camper;
  bedroom: Bedroom | null;
  sex: "girl" | "boy" | null;
  labelOf: (id: string | null | undefined) => string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

interface CheckItem {
  key: string;
  icon: ReactNode;
  title: string;
  text: string;
  /** e.g. the responsável's contact, read on tap */
  extra?: ReactNode;
}

/**
 * The kid opened at the door: the health and the responsáveis are read LIVE
 * from IPAlpha (never in the list — decision 31) so the helper confirms each
 * item with the family; the responsável's phone only on tap.
 */
export function CheckinDialog({ token, camper: k, bedroom, sex, labelOf, busy, onConfirm, onCancel }: CheckinDialogProps) {
  const { tx } = useI18n();
  const live = useCamperLive(token, k.id);
  const healthLabel = useHealthLabel(token);
  const labelHealth = (id: string | null | undefined) => (id ? healthLabel(id) || labelOf(id) : null);
  /** core refused this role the kid's health: say so gently — never "nothing declared" */
  const healthForbidden = !!live.data?.healthForbidden;
  const health = live.data && !healthForbidden ? { ...EMPTY_HEALTH, ...(live.data.health ?? {}) } : null;
  const responsibles = live.data?.responsibles ?? [];
  const name = k.name || live.data?.name || "";
  const checkedBy = usePersonName(k.checkin?.byPersonId);
  const items: CheckItem[] = !live.data
    ? []
    : [
        ...(health ? healthLines(health, labelHealth).map((l) => ({ key: l.title, icon: l.icon, title: l.title, text: l.text })) : []),
        ...(responsibles.length
          ? responsibles.map((r) => ({
              key: `responsible:${r.personId}`,
              icon: <ParentIcon size={18} />,
              title: tx("Responsável"),
              text: r.name || "…",
              extra: <PersonContact token={token} personId={r.personId} name={r.name} about={name} />,
            }))
          : [{ key: "responsible", icon: <ParentIcon size={18} />, title: tx("Responsável"), text: tx("nome não informado") }]),
      ];
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const ready = !!live.data || !!live.error;
  const allChecked = ready && items.every((i) => checked.has(i.key));
  const already = !!k.checkin;

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const age = ageOf(k.birthDate ?? null);

  return (
    <form
      className="cat-form cat-form--embedded checkin"
      onSubmit={(e) => {
        e.preventDefault();
        if (allChecked && !already) onConfirm();
      }}
    >
      <h2 className="cat-form__title detail-title">
        <KidIcon sex={sex} size={36} />
        {name || "…"}
        {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
      </h2>

      {already && k.checkin && (
        <p className="message message--ok">
          {tx("✅ Já fez check-in às {time} com {who}.", { time: speakTime(k.checkin.at), who: checkedBy.split(" ")[0] || "…" })}
          {k.checkin.note && ` 🤖 ${k.checkin.note}.`}
        </p>
      )}

      {/* where the kid goes: team + bedroom as compact tags */}
      <div className="staff-card__tags">
        <TeamTag teamId={k.team} fallback={tx("sem time")} />
        <BedroomTag bedroom={bedroom} fallback={tx("sem quarto")} />
        {labelOf(k.bed) && <span className="staff-tag">{tx("Cama {bed}", { bed: labelOf(k.bed)!.toLowerCase() })}</span>}
      </div>

      <dl className="detail-grid">
        <dt>{tx("Peso")}</dt>
        <dd>{healthForbidden ? <span className="cat-hint">{tx("não disponível para o seu perfil")}</span> : health?.weightKg != null ? `${String(health.weightKg).replace(".", ",")} kg` : "—"}</dd>
        <dt>{tx("Transporte")}</dt>
        <dd>{k.transportation ? <TransportTag transportId={k.transportation} /> : "—"}</dd>
        {k.bedroomPreference && (
          <>
            <dt>{tx("Quer ficar com")}</dt>
            <dd>{k.bedroomPreference}</dd>
          </>
        )}
      </dl>

      {!live.data && !live.error && <p className={`cat-hint ${styles.loading}`}>{tx("Lendo as informações de saúde e da família…")}</p>}
      {live.error && (
        <p className="message message--error">
          {tx("Não conseguimos ler as informações de saúde e da família agora.")}{" "}
          <button type="button" className="link-btn" onClick={live.reload}>{tx("Tentar de novo")}</button>
        </p>
      )}

      {healthForbidden && <p className={`staff-card__alert staff-card__alert--soft ${styles.reveal}`}>{tx("🩺 Saúde: não disponível para o seu perfil.")}</p>}

      <ul className={`checkin-list ${live.data ? styles.reveal : ""}`}>
        {items.map((i) => {
          const on = checked.has(i.key);
          return (
            <li key={i.key} className={`checkin-item ${on ? "checkin-item--ok" : ""}`}>
              <div className="checkin-item__info">
                <span className="checkin-item__title">
                  <span className="staff-card__alert-icon" aria-hidden="true">
                    {i.icon}
                  </span>{" "}
                  {i.title}
                </span>
                <span className="checkin-item__text">{i.text}</span>
                {i.extra}
              </div>
              <label className="checkin-check">
                <input type="checkbox" checked={on} disabled={already || busy} onChange={() => toggle(i.key)} />
                <span>{tx("Perguntei e está correto")}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="cat-form__actions">
        <button type="button" className="button button--secondary" disabled={busy} onClick={onCancel}>
          {already ? tx("Fechar") : tx("Cancelar")}
        </button>
        {!already && (
          <button type="submit" className="button button--primary" disabled={busy || !allChecked} title={allChecked ? undefined : tx("Confirme todos os itens com o responsável")}>
            {busy ? tx("Confirmando…") : tx("✅ Confirmar chegada")}
          </button>
        )}
      </div>
    </form>
  );
}


function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
