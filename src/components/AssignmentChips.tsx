import type { PointerEventHandler, DragEventHandler, MouseEventHandler, Ref } from "react";
import { ageOf, type Camper } from "../api/campers";
import { staffSex, type Staff } from "../api/staff";
import type { Bedroom } from "../api/bedrooms";
import { shortPersonName } from "../names";
import RoomRoleIcon from "./RoomRoleIcon";

interface SharedProps {
  busy?: boolean;
  className?: string;
  draggable?: boolean;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragEnd?: DragEventHandler<HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  buttonRef?: Ref<HTMLButtonElement>;
}

export function AssignmentCamperChip({ camper, peers = [], grouped = false, missing = false, noPreference = false, busy = false, className = "", draggable, onPointerDown, onDragStart, onDragEnd, onClick, onMouseEnter, onMouseLeave, buttonRef, ...data }: SharedProps & { camper: Camper; /** when two kids share a first name, show the last name too */ peers?: Iterable<{ name: string }>; grouped?: boolean; missing?: boolean; noPreference?: boolean; "data-assign-kid"?: string; "data-assign-drop"?: string }) {
  const age = ageOf(camper.birthDate ?? null);
  const label = camper.name ? shortPersonName(camper.name, peers) : "…";
  return <button ref={buttonRef} type="button" disabled={busy} draggable={draggable && !busy} className={`assign-chip${grouped ? " assign-chip--grouped" : ""}${missing ? " assign-chip--missing" : noPreference ? " assign-chip--nopref" : ""}${busy ? " assign-chip--saving" : ""}${className ? ` ${className}` : ""}`} onPointerDown={onPointerDown} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} aria-label={`${camper.name}${age !== null ? `, ${age} anos` : ""}${missing ? " — pediu alguém que não foi encontrado" : ""}`} {...data}>
    {label}
    {age !== null && <span className="assign-chip__age">{age}</span>}
  </button>;
}

export function AssignmentStaffChip({ staff, bedrooms, busy = false, className = "", draggable, onPointerDown, onDragStart, onDragEnd, onClick, onMouseEnter, onMouseLeave, buttonRef, ...data }: SharedProps & { staff: Staff; bedrooms: Bedroom[]; "data-assign-lead"?: string }) {
  const role = staff.roomRole === "caretaker" ? "líder" : "auxiliar";
  return <button ref={buttonRef} type="button" disabled={busy} draggable={draggable && !busy} className={`assign-chip assign-chip--staff${busy ? " assign-chip--saving" : ""}${className ? ` ${className}` : ""}`} onPointerDown={onPointerDown} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} aria-label={`${staff.name}, ${role}`} {...data}>
    <RoomRoleIcon role={staff.roomRole} size={18} sex={staffSex(staff, bedrooms)} />
    {staff.name.split(" ")[0] || "…"}
  </button>;
}
