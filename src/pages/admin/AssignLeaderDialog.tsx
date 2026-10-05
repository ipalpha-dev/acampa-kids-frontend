import RoomRoleIcon from "../../components/RoomRoleIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { bedroomLabel } from "../../api/bedrooms";
import BedroomTag from "../../components/BedroomTag";
import BedIcon from "../../components/BedIcon";
import { moveCamper, updateCamper, type Camper, type CamperSex } from "../../api/campers";
import { ROOM_ROLE_META, staffSex, updateStaff, type Staff } from "../../api/staff";
import { useConfirm } from "../../components/ConfirmDialog";
import Dialog from "../../components/Dialog";
import SearchField from "../../components/SearchField";
import { useCollectionOrEmpty } from "../../store";
import { useI18n } from "../../i18n";
import { compareByName, firstNameOf, shownName } from "./staffNames";

interface AssignLeaderDialogProps {
  token: string;
  open: boolean;
  camper: Camper;
  onClose: () => void;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

type Group = "roomLeaders" | "roomHelpers" | "others" | "staffWing" | "otherSex";

/**
 * Admin: pick a kid's líder. Search-as-you-type over the team of the kid's
 * sex (from the wing of the room each person sleeps in) — the room's
 * caretakers first, then the room's helpers, then everyone else, then the
 * staff wing (an exception: a parent on the team, say — the kid would sleep
 * there). When nothing of the kid's sex matches, the other sex is offered in
 * red and confirmed before saving. The staff member never moves: a helper is
 * promoted to caretaker of their room and, when the líder sleeps elsewhere,
 * the KID changes room (asked first).
 */
export default function AssignLeaderDialog({ token, open, camper: k, onClose }: AssignLeaderDialogProps) {
  const { tx } = useI18n();
  const staff = useCollectionOrEmpty("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const GROUP_LABEL: Record<Group, string> = {
    roomLeaders: tx("Líderes do quarto"),
    roomHelpers: tx("Auxiliares do quarto"),
    others: tx("Resto da equipe"),
    staffWing: tx("Ala da equipe"),
    otherSex: tx("Outro sexo"),
  };

  const SEX_LABEL: Record<CamperSex, string> = { F: tx("feminino"), M: tx("masculino") };

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const room = k.bedroom ? bedrooms.find((b) => b.id === k.bedroom) : undefined;
  const kidSex: CamperSex | null = (room?.group === "girls" ? "F" : room?.group === "boys" ? "M" : null) ?? k.sex;

  const results = useMemo(() => {
    const nq = normalize(q.trim());
    const byName = compareByName;
    // anyone with a room; the staff wing (no sex) is the exception at the end — a parent on the team, say.
    // admins are on the roster only for the room / transport / vest: they never look after kids
    const pool = staff.filter((s) => !s.redacted && !!s.bedroom && s.id !== k.caretakerId && (!nq || normalize(s.name).includes(nq) || normalize(s.nickname ?? "").includes(nq)));
    const sexOf = (s: Staff) => staffSex(s, bedrooms);
    const compatible = (s: Staff) => !kidSex || sexOf(s) === kidSex;
    const same = pool.filter(compatible);
    const inRoom = (s: Staff) => !!k.bedroom && s.bedroom === k.bedroom;
    const all: { group: Group; items: Staff[] }[] = [
      { group: "roomLeaders", items: same.filter((s) => inRoom(s) && s.roomRole === "caretaker").sort(byName) },
      { group: "roomHelpers", items: same.filter((s) => inRoom(s) && s.roomRole !== "caretaker").sort(byName) },
      { group: "others", items: same.filter((s) => !inRoom(s)).sort(byName) },
      { group: "staffWing", items: pool.filter((s) => sexOf(s) === null && !inRoom(s)).sort(byName) },
    ];
    const groups = all.filter((g) => g.items.length > 0);
    if (!groups.some((g) => g.group !== "staffWing") && kidSex) {
      const other = pool.filter((s) => sexOf(s) !== null && !compatible(s)).sort(byName);
      if (other.length) groups.push({ group: "otherSex", items: other });
    }
    return groups;
  }, [staff, bedrooms, q, kidSex, k.bedroom, k.caretakerId]);

  const flat = useMemo(() => results.flatMap((g) => g.items.map((s) => ({ s, group: g.group }))), [results]);
  useEffect(() => setCursor(0), [q]);

  async function pick(s: Staff) {
    if (busy) return;
    const first = firstNameOf(s.name);
    const kid = firstNameOf(k.name);
    const sRoom = s.bedroom ? bedrooms.find((b) => b.id === s.bedroom) : undefined;

    // the other sex was offered only because nobody of the kid's sex matched: make sure
    const sSex = staffSex(s, bedrooms);
    if (kidSex && sSex && sSex !== kidSex) {
      const ok = await confirm({
        emoji: "⚠️",
        danger: true,
        title: tx("{name} é do sexo {sex}. Confirmar como líder de {kid}?", { name: first, sex: SEX_LABEL[sSex], kid }),
        message: tx("{kid} é do sexo {sex}. Confira se é isso mesmo antes de continuar.", { kid, sex: SEX_LABEL[kidSex] }),
        confirmLabel: tx("Sim, confirmar"),
      });
      if (!ok) return;
    }

    // the staff member never moves: the kid goes to the líder's room when they differ
    if (!sRoom) return;
    const changeRoom = s.bedroom !== k.bedroom;
    if (changeRoom) {
      const toStaffWing = sRoom.group === "staff";
      const from = room ? tx("{kid} sai do quarto {room}", { kid, room: bedroomLabel(room) }) : tx("{kid} ainda não tem quarto", { kid });
      const ok = await confirm({
        emoji: toStaffWing ? "⚠️" : <BedIcon size={22} group={sRoom.group} />,
        danger: toStaffWing,
        title: tx("Mudar {name} para o quarto {room}?", { name: kid, room: bedroomLabel(sRoom) }),
        message: toStaffWing ? tx("Este é um quarto da EQUIPE, não de crianças.") : tx("{from} e vai para o quarto de {name}.", { from, name: first }),
        confirmLabel: tx("Mudar de quarto"),
      });
      if (!ok) return;
    }

    setBusy(true);
    setError(null);
    try {
      // a helper becomes a líder of their own room
      if (s.roomRole !== "caretaker") await updateStaff(token, s.id, { roomRole: "caretaker" });
      if (changeRoom) await moveCamper(token, k.id, sRoom.id, s.id);
      else await updateCamper(token, k.id, { caretakerId: s.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[cursor];
      if (hit) void pick(hit.s);
    }
  }

  const whoCares =
    kidSex === "F"
      ? tx("Quem vai cuidar da {name}?", { name: firstNameOf(k.name) })
      : kidSex === "M"
        ? tx("Quem vai cuidar do {name}?", { name: firstNameOf(k.name) })
        : tx("Quem vai cuidar do(a) {name}?", { name: firstNameOf(k.name) });

  let index = -1;
  return (
    <Dialog open={open} onClose={onClose} title={tx("Escolher líder")} width={520} dismissible={!busy} autofocus className="picker-sheet-dialog">
      <div className="picker picker-sheet">
        {/* head · body · actions: on phones this becomes a bottom sheet (see .picker-sheet) */}
        <header className="picker-sheet__head">
          <span className="picker-sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title">
            <RoomRoleIcon role="caretaker" sex={kidSex} /> {whoCares}
          </h2>
          <SearchField
            inputRef={inputRef}
            placeholder={tx("Digite o nome…")}
            value={q}
            disabled={busy}
            onChange={setQ}
            onKeyDown={onKey}
            aria-label={tx("Buscar pessoa")}
          />
          {kidSex && (
            <p className="cat-hint">
              {tx("Equipe do sexo {sex}", { sex: SEX_LABEL[kidSex] })}
              {/* the kid's OWN room, in the hint: keeps the green pill — it is a fact about the kid, not a row of the list */}
              {room ? <> · <BedroomTag bedroom={room} className="staff-tag--inline" /></> : tx(" · sem quarto")}
            </p>
          )}
          {error && <p className="message message--error">{error}</p>}
        </header>

        <div className="picker-sheet__body">
        {flat.length === 0 ? (
          <p className="opt-empty">{tx("Ninguém encontrado.")}</p>
        ) : (
          <ul className="picker__list" role="listbox">
            {results.map((g) => (
              <li key={g.group} className={`picker__group ${g.group === "otherSex" ? "picker__group--other" : ""}`}>
                <p className="picker__group-title">
                  {g.group === "otherSex" ? "⚠️ " : ""}
                  {GROUP_LABEL[g.group]}
                  {g.group === "otherSex" && kidSex && <span className="picker__group-hint">{tx("ninguém do sexo {sex} encontrado", { sex: SEX_LABEL[kidSex] })}</span>}
                </p>
                <ul className="picker__list">
                  {g.items.map((s) => {
                    index += 1;
                    const i = index;
                    const sRoom = s.bedroom ? bedrooms.find((b) => b.id === s.bedroom) : undefined;
                    const isOther = g.group === "otherSex";
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === cursor}
                          disabled={busy}
                          className={`picker__item ${isOther ? "picker__item--other" : ""} ${i === cursor ? "picker__item--cursor" : ""}`}
                          onMouseEnter={() => setCursor(i)}
                          onClick={() => void pick(s)}
                        >
                          <span className="picker__name">
                            {shownName(s.name)}
                            {/* · Líder / Auxiliar, right after the name */}
                            <span className="picker__role">
                              <span className="picker__dot" aria-hidden="true">·</span>
                              <RoomRoleIcon role={s.roomRole} sex={staffSex(s, bedrooms)} size={16} /> {tx(ROOM_ROLE_META[s.roomRole].label)}
                            </span>
                          </span>
                          {/* just the room: bunk + number, no pill and no wing face — the list is already filtered to the kid's wing */}
                          <span className="picker__meta">
                            {g.group !== "roomLeaders" && g.group !== "roomHelpers" && (sRoom ? <BedroomTag bedroom={sRoom} className="staff-tag--inline staff-tag--bare" /> : <span className="picker__busy-where">{tx("sem quarto")}</span>)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        </div>

        <div className="cat-form__actions picker-sheet__actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
            {tx("Cancelar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
